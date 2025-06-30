import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createClient,
  SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow requests from any origin (adjust for production)
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS", // Add methods as needed
};

console.log(`Function "find-match" up and running!`);

// Type for queue entries fetched from DB
interface QueueEntry {
  user_id: string;
  mbti_type: string;
  interested_mbti_types: string[];
}

// Helper function to check compatibility based on the logic defined earlier
function checkCompatibility(userA: QueueEntry, userB: QueueEntry): boolean {
  const a_interests = userA.interested_mbti_types || [];
  const b_interests = userB.interested_mbti_types || [];

  const a_is_open = a_interests.length === 0;
  const b_is_open = b_interests.length === 0;

  // Case 1: Both have preferences
  if (!a_is_open && !b_is_open) {
    return (
      a_interests.includes(userB.mbti_type) &&
      b_interests.includes(userA.mbti_type)
    );
  }
  // Case 2: A is open, B has preferences
  if (a_is_open && !b_is_open) {
    return b_interests.includes(userA.mbti_type);
  }
  // Case 3: B is open, A has preferences
  if (!a_is_open && b_is_open) {
    return a_interests.includes(userB.mbti_type);
  }
  // Case 4: Both are open
  if (a_is_open && b_is_open) {
    return true;
  }

  return false; // Should not be reached if logic is exhaustive
}

// Helper function to create chat and update queue atomically
async function createMatch(
  supabaseAdmin: SupabaseClient,
  userA: QueueEntry,
  userB: QueueEntry
) {
  console.log(`Attempting to match ${userA.user_id} with ${userB.user_id}`);

  // 1. Create the chat entry
  const { data: chatData, error: chatError } = await supabaseAdmin
    .from("chats")
    .insert({ user1_id: userA.user_id, user2_id: userB.user_id })
    .select("id") // Select the ID of the newly created chat
    .single();

  if (chatError || !chatData) {
    console.error("Error creating chat:", chatError?.message);
    throw new Error("Failed to create chat session.");
  }
  const chatId = chatData.id;
  console.log(`Chat created with ID: ${chatId}`);

  // 2. Remove both users from the queue (or update status - delete is simpler for now)
  const { error: deleteError } = await supabaseAdmin
    .from("queue")
    .delete()
    .in("user_id", [userA.user_id, userB.user_id]);

  if (deleteError) {
    // Attempt to rollback chat creation? Difficult without transactions. Log heavily.
    console.error(
      `CRITICAL: Failed to remove users ${userA.user_id}, ${userB.user_id} from queue after creating chat ${chatId}. Error: ${deleteError.message}`
    );
    // Consider deleting the chat entry here if possible, though it might leave orphans if messages were somehow sent.
    // await supabaseAdmin.from('chats').delete().eq('id', chatId); // Risky rollback attempt
    throw new Error("Failed to update queue status after match.");
  }
  console.log(
    `Users ${userA.user_id} and ${userB.user_id} removed from queue.`
  );

  // 3. TODO: Notify users via Realtime (can be done client-side listening to chat table, or via DB trigger/function)

  return chatId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use Admin client for broader queue access and atomic operations
    // Note: Using admin client bypasses RLS. Ensure function security.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" // Use Service Role Key for admin actions
    );

    // 1. Get the user ID who triggered the search (passed in request body)
    const { userId } = await req.json();
    if (!userId) {
      throw new Error("Missing userId in request body.");
    }
    console.log(`Find match triggered by user: ${userId}`);

    // 2. Fetch the triggering user's queue entry
    const { data: userAData, error: userAError } = await supabaseAdmin
      .from("queue")
      .select("user_id, mbti_type, interested_mbti_types")
      .eq("user_id", userId)
      .eq("status", "waiting") // Ensure they are actually waiting
      .maybeSingle(); // Use maybeSingle as they might have left the queue

    if (userAError) throw userAError;
    if (!userAData) {
      console.log(`User ${userId} not found in queue or not waiting.`);
      return new Response(
        JSON.stringify({ message: "User not in queue or already matched." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }
    const userA: QueueEntry = userAData;

    // 3. Fetch other waiting users (excluding self)
    const { data: potentialPartners, error: fetchError } = await supabaseAdmin
      .from("queue")
      .select("user_id, mbti_type, interested_mbti_types")
      .neq("user_id", userId) // Exclude self
      .eq("status", "waiting") // Only match with waiting users
      .order("joined_at", { ascending: true }); // Basic FIFO

    if (fetchError) throw fetchError;
    if (!potentialPartners || potentialPartners.length === 0) {
      console.log(`No potential partners found for user ${userId}.`);
      return new Response(
        JSON.stringify({ message: "No suitable match found yet." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 4. Iterate and find the first compatible match
    let matchedPartner: QueueEntry | null = null;
    for (const partner of potentialPartners) {
      const userB: QueueEntry = partner;
      if (checkCompatibility(userA, userB)) {
        matchedPartner = userB;
        break; // Found the first match
      }
    }

    // 5. If match found, create chat and update queue
    if (matchedPartner) {
      const chatId = await createMatch(supabaseAdmin, userA, matchedPartner);
      console.log(
        `Match successful for ${userA.user_id} and ${matchedPartner.user_id}. Chat ID: ${chatId}`
      );
      return new Response(
        JSON.stringify({ message: "Match found!", chatId: chatId }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } else {
      console.log(
        `No compatible partners found for user ${userId} among waiting users.`
      );
      return new Response(
        JSON.stringify({ message: "No compatible match found yet." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }
  } catch (error) {
    console.error("Error in find-match function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500, // Use 500 for server-side errors
    });
  }
});
