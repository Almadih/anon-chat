import { createClient } from "@/lib/supabase/server";
import { redirectWithToast } from "@/lib/utils";
import ChatRoomPage from "./chat-page";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function page({ params }: Params) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectWithToast("/login", {
      type: "error",
      message: "you need to be authenticated to access this page",
    });
  }

  const { data: chat } = await supabase
    .from("chats")
    .select("*")
    .eq("id", id)
    .single();

  if (!chat) {
    return redirectWithToast("/find-chat", {
      type: "error",
      message: "Chat not found",
    });
  }

  if (chat?.ended_at) {
    return redirectWithToast("/find-chat", {
      type: "error",
      message: "Chat ended",
    });
  }

  const chatPartnerId =
    chat?.user1_id === user?.id ? chat?.user2_id : chat?.user1_id;

  const { data: partnerProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", chatPartnerId!)
    .single()
    .overrideTypes<{ public_key: JsonWebKey }>();

  if (!partnerProfile) {
    return redirectWithToast("/find-chat", {
      type: "error",
      message: "Partner not found",
    });
  }

  return (
    <ChatRoomPage user={user} chat={chat} partnerProfile={partnerProfile} />
  );
}
