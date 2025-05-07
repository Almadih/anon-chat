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
  Lock, // For E2EE status
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  generateEncryptionKeyPair, // Not strictly needed here, but good for reference
  exportKeyToJwk, // Not strictly needed here
  importJwkToKey,
  encryptData,
  decryptData,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  deriveSharedKey, // Added for shared key derivation
} from "@/lib/crypto";
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
  const [currentUserPrivateKey, setCurrentUserPrivateKey] =
    useState<CryptoKey | null>(null);
  const [partnerPublicKey, setPartnerPublicKey] = useState<CryptoKey | null>(
    null
  );
  const [sharedSecretKey, setSharedSecretKey] = useState<CryptoKey | null>(
    null
  ); // For derived shared key
  const [encryptionStatus, setEncryptionStatus] = useState<
    "pending" | "active" | "failed" | "inactive"
  >("pending");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const presenceChannelRef = useRef<any>(null);

  useEffect(() => {}, [chatId]);

  // Fetch user, initial messages, and partner ID
  useEffect(() => {
    const initializeChat = async () => {
      setIsLoading(true);
      setEncryptionStatus("pending");
      let currentPartnerId: string | null = null;

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) {
        toast.error("Authentication error.");
        router.push("/login");
        setIsLoading(false);
        setEncryptionStatus("failed");
        return;
      }
      setUser(currentUser);

      // 1. Load current user's private key
      const storedPrivateKeyJwk = localStorage.getItem("privateKeyJwk");
      if (storedPrivateKeyJwk) {
        try {
          const parsedPrivJwk = JSON.parse(storedPrivateKeyJwk);
          // Updated to use new importJwkToKey signature and appropriate usages for ECDH private key
          const privateKey = await importJwkToKey(parsedPrivJwk, [
            "deriveKey",
            "deriveBits",
          ]);
          setCurrentUserPrivateKey(privateKey);
        } catch (e) {
          console.error("Failed to load/import private key:", e);
          toast.error(
            "Your encryption key is corrupted or missing. Cannot decrypt messages."
          );
          setEncryptionStatus("failed");
          // Potentially set isChatActive to false or handle this state
        }
      } else {
        toast.error(
          "Your encryption key is missing. Cannot decrypt messages. Please visit your profile to generate keys."
        );
        setEncryptionStatus("failed");
        // Potentially set isChatActive to false
      }

      // 2. Fetch chat details to find partner ID
      const { data: chatDetails, error: chatDetailsError } = await supabase
        .from("chats")
        .select("ended_at, user1_id, user2_id")
        .eq("id", chatId)
        .single();

      if (chatDetailsError || !chatDetails) {
        toast.error("Could not load chat details.");
        setIsChatActive(false);
        setIsLoading(false);
        setEncryptionStatus("failed");
        return;
      }

      if (chatDetails.ended_at) {
        toast.info("This chat has already ended.");
        setIsChatActive(false);
        setEncryptionStatus("inactive");
      }

      if (currentUser.id === chatDetails.user1_id) {
        currentPartnerId = chatDetails.user2_id;
        setPartnerId(chatDetails.user2_id);
      } else if (currentUser.id === chatDetails.user2_id) {
        currentPartnerId = chatDetails.user1_id;
        setPartnerId(chatDetails.user1_id);
      } else {
        toast.error("Access denied to this chat.");
        setIsChatActive(false);
        setIsLoading(false);
        setEncryptionStatus("failed");
        return;
      }

      // 3. Fetch partner's public key if partnerId is found
      if (currentPartnerId) {
        const { data: partnerProfile, error: partnerProfileError } =
          await supabase
            .from("profiles")
            .select("public_key")
            .eq("id", currentPartnerId)
            .single();

        console.log({ currentPartnerId });

        if (
          partnerProfileError ||
          !partnerProfile ||
          !partnerProfile.public_key
        ) {
          console.error(
            "Failed to fetch partner's public key:",
            partnerProfileError
          );
          toast.error(
            "Could not retrieve partner's encryption key. Cannot send encrypted messages."
          );
          setEncryptionStatus("failed");
          // Potentially set isChatActive to false
        } else {
          try {
            // Updated to use new importJwkToKey signature for ECDH public key
            const pubKey = await importJwkToKey(
              partnerProfile.public_key as JsonWebKey,
              [] // ECDH public keys are used in deriveKey, not directly for encrypt/decrypt
            );
            setPartnerPublicKey(pubKey);
          } catch (e) {
            console.error("Failed to import partner's public key:", e);
            toast.error(
              "Partner's encryption key is invalid. Cannot send encrypted messages."
            );
            setEncryptionStatus("failed");
          }
        }
      } else {
        setEncryptionStatus("failed"); // Should not happen if chatDetails logic is correct
      }

      setIsLoading(false); // Set loading to false after all async operations
    };
    initializeChat();
  }, [supabase, chatId, router]); // currentUserPrivateKey, partnerPublicKey are implicitly part of this effect's re-run logic via initializeChat

  useEffect(() => {
    const initDerivedKey = async () => {
      if (!currentUserPrivateKey || !partnerPublicKey) return;

      // Update encryption status based on key availability and derive shared key
      if (currentUserPrivateKey && partnerPublicKey && isChatActive) {
        try {
          const storedSharedKeyJwkString = localStorage.getItem(
            `sharedKey_jwk_${chatId}`
          );
          let derivedKey: CryptoKey | null = null;

          if (storedSharedKeyJwkString) {
            try {
              const storedSharedKeyJwk = JSON.parse(storedSharedKeyJwkString);
              // Import with AES-GCM usages
              derivedKey = await importJwkToKey(storedSharedKeyJwk, [
                "encrypt",
                "decrypt",
              ]);
              console.log("Loaded shared key from localStorage");
            } catch (e) {
              console.warn(
                "Failed to load shared key from localStorage, re-deriving:",
                e
              );
              localStorage.removeItem(`sharedKey_jwk_${chatId}`); // Clear corrupted key
            }
          }

          if (!derivedKey) {
            derivedKey = await deriveSharedKey(
              currentUserPrivateKey,
              partnerPublicKey
            );
            const exportedDerivedKeyJwk = await exportKeyToJwk(derivedKey);
            localStorage.setItem(
              `sharedKey_jwk_${chatId}`,
              JSON.stringify(exportedDerivedKeyJwk)
            );
            console.log("Derived and stored new shared key");
          }
          console.log("Derived shared key:", derivedKey);
          setSharedSecretKey(derivedKey);
          console.log("Encryption status set to active", sharedSecretKey);
          setEncryptionStatus("active");
        } catch (e) {
          console.error("Failed to derive or store shared key:", e);
          toast.error("Failed to establish secure session.");
          setEncryptionStatus("failed");
        }
      } else if (isChatActive) {
        // If chat is active but keys are missing for derivation
        setEncryptionStatus("failed");
        if (!currentUserPrivateKey)
          toast.error("Your encryption key is missing.");
        if (!partnerPublicKey)
          toast.error("Partner's encryption key is missing.");
      }
    };
    initDerivedKey();
  }, [currentUserPrivateKey, partnerPublicKey, isChatActive]);

  useEffect(() => {
    const loadMessages = async () => {
      if (!sharedSecretKey || !isChatActive) {
        if (isChatActive && encryptionStatus !== "pending") {
          // Only show error if not pending and chat is supposed to be active
          // toast.error("Cannot load messages: Secure session not established.");
        }
        return;
      }

      const { data: initialMessagesRaw, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        toast.error("Failed to load chat messages.");
      } else if (initialMessagesRaw) {
        const decryptedMessages: Message[] = [];
        for (const msg of initialMessagesRaw) {
          try {
            const decryptedContent = await decryptData(
              sharedSecretKey, // Use shared key for decryption
              base64ToArrayBuffer(msg.content)
            );
            decryptedMessages.push({ ...msg, content: decryptedContent });
          } catch (e) {
            console.error(
              `Failed to decrypt message ${msg.id} with shared key:`,
              e
            );
            decryptedMessages.push({
              ...msg,
              content: "[Message undecryptable]",
            });
          }
        }
        setMessages(decryptedMessages);
      }
    };

    if (sharedSecretKey && isChatActive && encryptionStatus === "active") {
      loadMessages();
    } else if (isChatActive && encryptionStatus === "failed") {
      // Potentially clear messages or show error state
      setMessages([]); // Clear messages if encryption failed
      toast.error("Encryption failed, cannot display messages securely.");
    }
  }, [sharedSecretKey, isChatActive, chatId, supabase, encryptionStatus]);

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
        async (payload) => {
          const newMessage = payload.new as Message;
          if (sharedSecretKey) {
            try {
              const decryptedContent = await decryptData(
                sharedSecretKey, // Use shared key
                base64ToArrayBuffer(newMessage.content)
              );
              setMessages((prev) =>
                prev.some((msg) => msg.id === newMessage.id)
                  ? prev
                  : [...prev, { ...newMessage, content: decryptedContent }]
              );
            } catch (e) {
              console.error(
                "Failed to decrypt incoming message with shared key:",
                e
              );
              setMessages((prev) =>
                prev.some((msg) => msg.id === newMessage.id)
                  ? prev
                  : [
                      ...prev,
                      { ...newMessage, content: "[Message undecryptable]" },
                    ]
              );
            }
          } else {
            // Shared key not ready, show placeholder or error
            console.warn(
              "Received message but shared key is not available for decryption."
            );
            setMessages((prev) =>
              prev.some((msg) => msg.id === newMessage.id)
                ? prev
                : [
                    ...prev,
                    {
                      ...newMessage,
                      content: "[Decrypting... Key not ready]",
                    },
                  ]
            );
          }
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
  }, [chatId, supabase, isChatActive, user, partnerId, sharedSecretKey]); // Added user and partnerId

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
  }, [isChatActive, user, partnerId, presenceChannelRef, typingTimeoutRef]); // Added refs to dependency array

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
    if (
      !newMessage.trim() ||
      !user ||
      !chatId ||
      !isChatActive ||
      encryptionStatus !== "active" || // Check general encryption status
      !sharedSecretKey // Crucially, check if sharedSecretKey is available
    ) {
      if (encryptionStatus !== "active") {
        toast.error("Encryption is not active. Cannot send message.");
      }
      if (!sharedSecretKey) {
        toast.error("Secure session not established. Cannot send message.");
      }
      return;
    }

    const plainTextContent = newMessage.trim();
    const tempId = `temp_${Date.now()}`;

    // Optimistic update with plain text for immediate display
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        sender_id: user.id,
        content: plainTextContent, // Optimistically show plain text
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
      try {
        // Encrypt with the shared secret key
        const encryptedBuffer = await encryptData(
          sharedSecretKey, // Use shared key
          plainTextContent
        );
        console.log({ sharedSecretKey });
        const encryptedBase64 = arrayBufferToBase64(encryptedBuffer);

        const { data, error } = await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            sender_id: user.id,
            content: encryptedBase64,
          })
          .select()
          .single();

        if (error) {
          toast.error("Failed to send message.");
          setMessages((prev) => prev.filter((msg) => msg.id !== tempId)); // Remove optimistic
          setNewMessage(plainTextContent); // Restore input
        } else if (data) {
          // Replace optimistic message with confirmed one (content is still plain text from optimistic)
          // The actual content from DB (data.content) is encrypted.
          // The subscription listener should handle decrypting messages from others.
          // For our own messages, if we want to replace the optimistic plain text with a decrypted version
          // of what was stored, we could decrypt data.content here.
          // However, since we sent it, we know the plain text.
          // The main concern is that `data.content` from DB is encrypted.
          // If we map it directly, it will show encrypted.
          // Let's ensure the optimistic message (plain text) is simply updated with the real ID.
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempId
                ? { ...msg, id: data.id /* content remains plainTextContent */ }
                : msg
            )
          );
        }
      } catch (encError) {
        console.error("Encryption failed:", encError);
        toast.error("Failed to encrypt message. Not sent.");
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId)); // Remove optimistic
        setNewMessage(plainTextContent); // Restore input
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
        <div className="flex items-center gap-4">
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
          {/* E2EE Status Indicator */}
          <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            <Lock
              className={`h-3 w-3 ${
                encryptionStatus === "active"
                  ? "text-green-500"
                  : encryptionStatus === "failed"
                  ? "text-red-500"
                  : "text-yellow-500"
              }`}
            />
            <span>
              {encryptionStatus === "active" && "E2E Encrypted"}
              {encryptionStatus === "pending" && "Encryption Pending..."}
              {encryptionStatus === "failed" && "Encryption Failed"}
              {encryptionStatus === "inactive" && "Chat Ended"}
            </span>
          </div>
        </div>
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
                          // className is removed to let cva variants apply directly
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
