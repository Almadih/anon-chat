import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow requests from any origin (adjust for production)
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS", // Add methods as needed
};

console.log(`Function "join-queue" up and running!`);

interface QueueEntry {
  mbti_type: string;
  interested_mbti_types: string[];
}

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Validate request data
    const { mbti_type, interested_mbti_types }: QueueEntry = await req.json();
    if (!mbti_type || !Array.isArray(interested_mbti_types)) {
      throw new Error(
        "Missing or invalid parameters: mbti_type and interested_mbti_types (array) are required."
      );
    }

    // 2. Create Supabase client with auth context
    const authHeader = req.headers.get("Authorization")!;
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // 3. Get the user from the auth header
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("User auth error:", userError?.message);
      throw new Error("Authentication failed.");
    }

    console.log(user);

    // 4. Upsert user into the queue
    const { error: queueError } = await supabaseClient.from("queue").upsert(
      {
        user_id: user.id,
        mbti_type: mbti_type,
        interested_mbti_types: interested_mbti_types,
        status: "waiting", // Set status to waiting
        joined_at: new Date().toISOString(), // Update joined_at time
      },
      { onConflict: "user_id" }
    ); // Upsert based on user_id

    if (queueError) {
      console.error("Queue upsert error:", queueError.message);
      throw new Error(`Failed to join queue: ${queueError.message}`);
    }

    // 5. Return success
    return new Response(
      JSON.stringify({ message: "Successfully joined queue" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in join-queue function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400, // Use 400 for client errors, 500 for server errors
    });
  }
});
