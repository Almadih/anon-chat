import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log(`Function "leave-queue" up and running!`);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Allow requests from any origin (adjust for production)
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS", // Add methods as needed
};
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Create Supabase client with auth context
    const authHeader = req.headers.get("Authorization")!;
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // 2. Get the user from the auth header
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("User auth error:", userError?.message);
      throw new Error("Authentication failed.");
    }

    // 3. Delete the user's entry from the queue
    const { error: deleteError } = await supabaseClient
      .from("queue")
      .delete()
      .eq("user_id", user.id); // Delete based on the authenticated user's ID

    if (deleteError) {
      // Log error but maybe don't throw? User might already be gone.
      console.error(
        `Error removing user ${user.id} from queue:`,
        deleteError.message
      );
      // Consider returning success even if delete failed, as the goal is achieved if they aren't in queue.
      // throw new Error(`Failed to leave queue: ${deleteError.message}`);
    } else {
      console.log(`User ${user.id} successfully removed from queue.`);
    }

    // 4. Return success
    return new Response(
      JSON.stringify({ message: "Successfully left queue" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in leave-queue function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400, // Use 400 for client errors (like auth), 500 for server errors
    });
  }
});
