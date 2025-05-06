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
import { Input } from "@/components/ui/input"; // Not used in current version, but keep for potential future
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
} from "@/components/ui/alert-dialog";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Loader2,
  ArrowLeft,
  Paperclip, // Not used
  Mic, // Not used
  CornerDownLeft,
  Circle, // For presence indicator
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import {
  ChatBubble,
  ChatBubbleMessage,
  ChatBubbleTimestamp,
} from "@/components/ui/chat/chat-bubble";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Not used yet
import { ChatInput } from "@/components/ui/chat/chat-input";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ChatPageProps {
  params: { chatId: string };
}

export default function ChatRoomPage({
  params,
}: {
  params: Promise<ChatPageProps["params"]>;
}) {
  const resolvedParams = use(params);
  const { chatId } = resolvedParams;

  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isChatActive, setIsChatActive] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isSendingMessage, startSendingMessageTransition] = useTransition();
  const [isEndingChat, startEndingChatTransition] = useTransition();
  const [partnerPresence, setPartnerPresence] = useState<"online" | "offline">(
    "offline"
  );
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const presenceChannelRef = useRef<any>(null);

  // Fetch user, initial messages, and partner ID
  useEffect(() => {
    const initializeChat = async () => {
      setIsLoading(true);
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) {
        toast.error("Authentication error.");
        router.push("/login");
        return;
      }
      setUser(currentUser);

      const { data: initialMessages, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        toast.error("Failed to load chat messages.");
        setIsChatActive(false);
      } else {
        setMessages(initialMessages || []);
      }

      const { data: chatDetails, error: chatDetailsError } = await supabase
        .from("chats")
        .select("ended_at, user1_id, user2_id")
        .eq("id", chatId)
        .single(); // Chat must exist

      if (chatDetailsError || !chatDetails) {
        toast.error("Could not load chat details.");
        setIsChatActive(false);
      } else {
        if (chatDetails.ended_at) {
          toast.info("This chat has already ended.");
          setIsChatActive(false);
        }
        if (currentUser.id === chatDetails.user1_id) {
          setPartnerId(chatDetails.user2_id);
        } else if (currentUser.id === chatDetails.user2_id) {
          setPartnerId(chatDetails.user1_id);
        } else {
          toast.error("Access denied to this chat.");
          setIsChatActive(false);
        }
      }
      setIsLoading(false);
    };
    initializeChat();
  }, [supabase, chatId, router]);

  // Scroll to bottom
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Realtime subscriptions
  useEffect(() => {
    if (!chatId || !isChatActive || !user) return;

    // Message Subscription
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
          setMessages((prev) =>
            prev.some((msg) => msg.id === (payload.new as Message).id)
              ? prev
              : [...prev, payload.new as Message]
          );
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR")
          toast.error("Message connection error.");
      });

    // Chat Status (End) Subscription
    const chatStatusChannel = supabase
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
          const updatedChat = payload.new as { ended_at: string | null };
          if (updatedChat.ended_at) {
            toast.info("Chat ended.");
            setIsChatActive(false);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR")
          console.error("Chat status channel error:", err);
      });

    // Presence Subscription (only if partnerId is known)
    if (partnerId && user) {
      // Added user check
      const presChannel = supabase.channel(`chat_presence_${chatId}`, {
        config: {
          presence: { key: user.id },
          broadcast: { self: false, ack: false }, // Enable broadcast
        },
      });

      presChannel
        .on("presence", { event: "sync" }, () => {
          const presences = presChannel.presenceState();
          const partnerIsOnline = Object.keys(presences).some(
            (key) => key === partnerId
          );
          setPartnerPresence(partnerIsOnline ? "online" : "offline");
        })
        .on("presence", { event: "join" }, ({ key }) => {
          if (key === partnerId) setPartnerPresence("online");
        })
        .on("presence", { event: "leave" }, ({ key }) => {
          if (key === partnerId) setPartnerPresence("offline");
        })
        .on("broadcast", { event: "typing_start" }, ({ payload }) => {
          if (payload && payload.sender_id === partnerId) {
            setIsPartnerTyping(true);
          }
        })
        .on("broadcast", { event: "typing_stop" }, ({ payload }) => {
          if (payload && payload.sender_id === partnerId) {
            setIsPartnerTyping(false);
          }
        });

      presChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presChannel.track({ online_at: new Date().toISOString() }); // For presence
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setPartnerPresence("offline");
        }
      });
      presenceChannelRef.current = presChannel; // Store for cleanup
    }

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(chatStatusChannel);
      if (presenceChannelRef.current) {
        presenceChannelRef.current
          .untrack()
          .then(() => supabase.removeChannel(presenceChannelRef.current));
      }
    };
  }, [chatId, supabase, isChatActive, user, partnerId]); // Added user and partnerId

  // Effect to clear typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Effect to send typing_stop when chat becomes inactive
  useEffect(() => {
    if (!isChatActive && presenceChannelRef.current && user && partnerId) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      presenceChannelRef.current.send({
        type: "broadcast",
        event: "typing_stop",
        payload: { sender_id: user.id },
      });
      setIsPartnerTyping(false); // Also clear local display if chat ends
    }
  }, [isChatActive, user, partnerId]);

  const handleTypingChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setNewMessage(event.target.value);

    if (!presenceChannelRef.current || !user || !isChatActive || !partnerId)
      return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    presenceChannelRef.current.send({
      type: "broadcast",
      event: "typing_start",
      payload: { sender_id: user.id },
    });

    typingTimeoutRef.current = setTimeout(() => {
      if (presenceChannelRef.current && user && isChatActive) {
        // Check isChatActive again
        presenceChannelRef.current.send({
          type: "broadcast",
          event: "typing_stop",
          payload: { sender_id: user.id },
        });
      }
    }, 1500); // 1.5 seconds of inactivity
  };

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !chatId || !isChatActive) return;
    const contentToSend = newMessage.trim();
    const tempId = `temp_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        sender_id: user.id,
        content: contentToSend,
        created_at: new Date().toISOString(),
      },
    ]);
    setNewMessage("");
    formRef.current?.reset();

    // Stop typing indicator on send
    if (presenceChannelRef.current && user && isChatActive && partnerId) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      presenceChannelRef.current.send({
        type: "broadcast",
        event: "typing_stop",
        payload: { sender_id: user.id },
      });
    }

    startSendingMessageTransition(async () => {
      const { data, error } = await supabase
        .from("messages")
        .insert({ chat_id: chatId, sender_id: user.id, content: contentToSend })
        .select()
        .single();
      if (error) {
        toast.error("Failed to send message.");
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        setNewMessage(contentToSend);
      } else if (data) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? ({ ...data, id: data.id } as Message) : msg
          )
        );
      }
    });
  };

  const performEndChat = () => {
    if (!chatId || !isChatActive) return;
    startEndingChatTransition(async () => {
      const { error } = await supabase
        .from("chats")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", chatId);
      if (error) {
        toast.error("Failed to end chat session.");
        setIsChatActive(true);
      }
      // Realtime update should handle UI changes for both users
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
      <div className="relative flex justify-between items-center max-w-5xl w-full px-2">
        {" "}
        {/* Changed to justify-between */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/find-chat")}
          className="text-xs sm:text-sm"
        >
          <ArrowLeft className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Back to Find Chat</span>
          <span className="sm:hidden">Back</span>
        </Button>
        {/* Partner Presence Indicator */}
        {partnerId && (
          <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Partner:
            <Circle
              className={`h-3 w-3 ${
                partnerPresence === "online"
                  ? "fill-green-500 text-green-500"
                  : "fill-gray-400 text-gray-400"
              }`}
            />
            {partnerPresence}
          </div>
        )}
      </div>
      <div className="z-10 border rounded-lg max-w-5xl w-full h-[calc(100%-60px)] text-sm flex">
        {" "}
        {/* Adjusted height */}
        <div className="flex h-full w-full flex-col">
          <div
            ref={messagesContainerRef}
            className="flex-1 w-full overflow-y-auto bg-muted/40"
          >
            {" "}
            {/* Added ref here */}
            <ChatMessageList>
              {" "}
              {/* Removed ref from here */}
              <AnimatePresence>
                {messages.map((message, index) => {
                  const variant =
                    message.sender_id === user?.id ? "sent" : "received";
                  return (
                    <motion.div
                      key={message.id} // Use message.id for key
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
                      <ChatBubble variant={variant}>
                        <ChatBubbleMessage
                          className={`${
                            variant === "sent"
                              ? "bg-blue-600 text-white"
                              : "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
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
          {isPartnerTyping && partnerId && isChatActive && (
            <div className="px-4 pt-1 pb-1 text-xs text-gray-500 dark:text-gray-400 italic">
              Partner is typing...
            </div>
          )}
          <div className="px-4 pb-4 bg-muted/40">
            <form
              ref={formRef}
              onSubmit={handleSendMessage}
              className="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring"
            >
              <ChatInput
                ref={inputRef}
                value={newMessage} // Ensure value is bound
                onChange={handleTypingChange} // Use new handler
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(
                      e as unknown as React.FormEvent<HTMLFormElement>
                    );
                  }
                }}
                placeholder={
                  isChatActive ? "Type your message here..." : "Chat has ended"
                }
                className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0"
                disabled={!isChatActive}
              />
              <div className="flex items-center p-3 pt-0 gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!isChatActive || isEndingChat}
                      className="px-3 sm:px-4 ml-auto"
                    >
                      {isEndingChat ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <span className="hidden sm:inline">End Chat</span>{" "}
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
                          </svg>
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
                        onClick={performEndChat}
                        disabled={isEndingChat}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
