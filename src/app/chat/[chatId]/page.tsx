"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useTransition,
  use,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Import AlertDialog components
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Loader2,
  ArrowLeft,
  Paperclip,
  Mic,
  CornerDownLeft,
} from "lucide-react"; // Add ArrowLeft
import { useRouter } from "next/navigation"; // For back navigation
import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import {
  ChatBubble,
  ChatBubbleMessage,
  ChatBubbleTimestamp,
} from "@/components/ui/chat/chat-bubble";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChatInput } from "@/components/ui/chat/chat-input";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ChatPageProps {
  params: { chatId: string }; // Get chatId from route params
}

// The component receives a Promise<ChatPageProps> implicitly
export default function ChatRoomPage({
  params,
}: {
  params: Promise<ChatPageProps["params"]>;
}) {
  // Use the 'use' hook to resolve the promise
  const resolvedParams = use(params);
  const { chatId } = resolvedParams; // Destructure chatId from the resolved params

  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true); // State for initial message load
  const [isChatActive, setIsChatActive] = useState(true); // Track if chat is ended
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isSendingMessage, startSendingMessageTransition] = useTransition();
  const [isEndingChat, startEndingChatTransition] = useTransition();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch user and initial messages
  useEffect(() => {
    const initializeChat = async () => {
      setIsLoading(true);
      console.log("Initializing chat");
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) {
        toast.error("Authentication error.");
        router.push("/login");
        return;
      }
      setUser(currentUser);

      // Fetch initial messages for this chat
      const { data: initialMessages, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error("Error fetching messages:", messagesError);
        toast.error("Failed to load chat messages.");
        setIsChatActive(false); // Assume chat is invalid if messages fail
      } else {
        setMessages(initialMessages || []);
      }

      // Check if chat is already ended (optional, could rely on realtime)
      const { data: chatData, error: chatError } = await supabase
        .from("chats")
        .select("ended_at")
        .eq("id", chatId)
        .maybeSingle(); // Use maybeSingle in case chat doesn't exist

      if (chatError || !chatData) {
        console.error(
          "Error fetching chat status or chat not found:",
          chatError?.message
        );
        toast.error("Chat not found or could not load status.");
        setIsChatActive(false);
      } else if (chatData.ended_at) {
        toast.info("This chat has already ended.");
        setIsChatActive(false);
      }

      setIsLoading(false);
    };

    initializeChat();
  }, [supabase, chatId, router]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscriptions for messages and chat end
  useEffect(() => {
    if (!chatId || !isChatActive) return; // Only subscribe if chat is active

    const messageChannel = supabase
      .channel(`chat_messages_${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          console.log("New message received:", payload);
          // Avoid adding duplicate if sender's own message comes via RT before DB confirms insert
          setMessages((prevMessages) =>
            prevMessages.some((msg) => msg.id === (payload.new as Message).id)
              ? prevMessages
              : [...prevMessages, payload.new as Message]
          );
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Message channel error:", err);
          toast.error("Message connection error.");
        }
      });

    const chatChannel = supabase
      .channel(`chat_status_${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chats",
          filter: `id=eq.${chatId}`,
        },
        (payload) => {
          console.log("Chat update received:", payload);
          const updatedChat = payload.new as { ended_at: string | null };
          if (updatedChat.ended_at) {
            toast.info("Chat ended. You can find a new chat.");
            setIsChatActive(false); // Disable input etc.
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Chat status channel error:", err);
          // Maybe less critical to notify user?
        }
      });

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(chatChannel);
    };
  }, [chatId, supabase, isChatActive]);

  // Send Message Handler
  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !chatId || !isChatActive) return;
    const contentToSend = newMessage.trim();
    const tempId = `temp_${Date.now()}`; // Temporary ID for optimistic update

    // Optimistic UI update
    setMessages((prev) => [
      ...prev,
      {
        id: tempId, // Use temporary ID
        sender_id: user.id,
        content: contentToSend,
        created_at: new Date().toISOString(),
      },
    ]);
    setNewMessage("");
    formRef.current?.reset();

    startSendingMessageTransition(async () => {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          chat_id: chatId,
          sender_id: user.id,
          content: contentToSend,
        })
        .select()
        .single(); // Select the inserted row to get the real ID

      if (error) {
        console.error("Error sending message:", error.message);
        toast.error("Failed to send message.");
        // Remove optimistic message
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        setNewMessage(contentToSend); // Add back for retry
      } else if (data) {
        // Replace temp message with real one (optional, RT might handle it)
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? ({ ...data, id: data.id } as Message) : msg
          )
        );
      }
    });
  };

  // End Chat Handler - Now triggered by AlertDialog Action
  const performEndChat = () => {
    if (!chatId || !isChatActive) return; // Still good to have guards

    startEndingChatTransition(async () => {
      // Note: setIsChatActive(false) is implicitly handled by the UI disabling
      // but we might keep it if other logic depends on it before the API call finishes.
      // For now, let's assume the button disabling is enough visual feedback initially.
      // setIsChatActive(false); // Can potentially remove this immediate disable
      const { error } = await supabase
        .from("chats")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", chatId);

      if (error) {
        console.error("Error updating chat end time:", error.message);
        toast.error("Failed to end chat session.");
        setIsChatActive(true); // Re-enable UI on error
      } else {
        // toast.info("Chat ended. You can find a new chat.");
        // Optionally redirect after a delay or provide a button
        // router.push('/find-chat');
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <main className="flex h-[calc(93dvh)] flex-col items-center justify-center p-4 gap-4">
      {/* Header Area */}
      <div className="relative flex justify-start items-center max-w-5xl w-full">
        <Button
          variant="ghost"
          size="sm" // Smaller button on mobile
          onClick={() => router.push("/find-chat")}
          // Adjusted absolute positioning for smaller screens
          className="text-xs sm:text-sm"
        >
          <ArrowLeft className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Back to Find Chat</span>{" "}
          {/* Hide text on xs */}
          <span className="sm:hidden">Back</span>{" "}
          {/* Show shorter text on xs */}
        </Button>
      </div>
      <div className="z-10 border rounded-lg max-w-5xl w-full h-[90%] text-sm flex">
        <div className="flex h-full w-full flex-col">
          <div className="flex-1 w-full overflow-y-auto bg-muted/40">
            <ChatMessageList ref={messagesContainerRef}>
              {/* Chat messages */}
              <AnimatePresence>
                {messages.map((message, index) => {
                  const variant =
                    message.sender_id === user?.id ? "sent" : "received";
                  return (
                    <motion.div
                      key={index}
                      layout
                      initial={{ opacity: 0, scale: 1, y: 50, x: 0 }}
                      animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                      exit={{ opacity: 0, scale: 1, y: 1, x: 0 }}
                      transition={{
                        opacity: { duration: 0.1 },
                        layout: {
                          type: "spring",
                          bounce: 0.3,
                          duration: index * 0.05 + 0.2,
                        },
                      }}
                      style={{ originX: 0.5, originY: 0.5 }}
                      className="flex flex-col gap-2 p-4"
                    >
                      <ChatBubble key={index} variant={variant}>
                        <ChatBubbleMessage
                          className={`${
                            variant === "sent"
                              ? "bg-blue-600 text-white" // Keep sender style
                              : "bg-gray-200 text-gray-900"
                          }`}
                          isLoading={false}
                        >
                          {message.content}
                          <ChatBubbleTimestamp
                            timestamp={format(
                              new Date(message.created_at),
                              "p"
                            )}
                          />
                        </ChatBubbleMessage>
                      </ChatBubble>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </ChatMessageList>
          </div>
          <div className="px-4 pb-4 bg-muted/40">
            <form
              ref={formRef}
              onSubmit={handleSendMessage}
              className="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring"
            >
              <ChatInput
                ref={inputRef}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setNewMessage(event.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    handleSendMessage(
                      e as unknown as React.FormEvent<HTMLFormElement>
                    );
                  }
                }}
                placeholder="Type your message here..."
                className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center p-3 pt-0 gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm" // Smaller button size
                      variant="destructive"
                      // No direct onClick here, it triggers the dialog
                      disabled={!isChatActive || isEndingChat} // Disable trigger if already ending or chat inactive
                      className="px-3 sm:px-4 ml-auto " // Adjust padding
                    >
                      {/* Button Content */}
                      {isEndingChat ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <span className="hidden sm:inline">End Chat</span>{" "}
                          {/* Hide text on xs */}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="sm:hidden h-4 w-4"
                          >
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>{" "}
                          {/* X Icon for xs */}
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Are you absolutely sure?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. Ending the chat will
                        disconnect you from your partner permanently.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isEndingChat}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={performEndChat} // Call the actual end chat logic
                        disabled={isEndingChat} // Disable action if already ending
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-white" // Destructive styling
                      >
                        {isEndingChat ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        End Chat
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button
                  disabled={
                    !isChatActive || !newMessage.trim() || isSendingMessage
                  }
                  size="sm"
                  className="gap-1.5"
                >
                  {isSendingMessage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Send Message"
                  )}

                  <CornerDownLeft className="size-3.5" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
