import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FindChat from "./find-chat";
// import { cookies } from "next/headers"; // No longer needed here as createClient handles it

export default async function FindChatPage() {
  // const cookieStore = cookies(); // createClient from server.ts handles cookies internally
  const supabase = await createClient(); // createClient is async and doesn't take cookieStore as arg

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const userId = user.id;

    // Check for an active chat
    const { data: activeChat } = await supabase
      .from("chats")
      .select("id")
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .is("ended_at", null) // Check if the chat is active
      .order("created_at", { ascending: false })
      .limit(1)
      .single(); // Expect at most one active chat

    if (activeChat) {
      // If an active chat is found, redirect to it
      redirect(`/chat/${activeChat.id}`);
    }
  }

  if (!user) {
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id)
    .single()
    .overrideTypes<{ public_key: JsonWebKey }>();
  if (!profile || !user) {
    return;
  }

  const { data: queueData } = await supabase
    .from("queue")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "waiting")
    .single();
  return <FindChat profile={profile} user={user} queue={queueData} />;
}
