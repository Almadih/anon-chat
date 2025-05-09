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
  generateKeyFingerprint,
  EMOJI_LIST, // Added for safety emojis
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
import { useChatInitialization } from "../../../hooks/useChatInitialization";
import { useEncryption } from "../../../hooks/useEncryption";
import { useMessageDecryption } from "../../../hooks/useMessageDecryption";
import { useRealtimeEvents } from "../../../hooks/useRealtimeEvents"; // Import the new hook

// mapHashToEmojis is now imported from @/lib/crypto

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
  // isLoading, user, partnerId, isChatActive will be managed by or initialized from useChatInitialization
  const [isChatActive, setIsChatActive] = useState(true); // Will be updated by hook's initial value
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isSendingMessage, startSendingMessageTransition] = useTransition();
  const [isEndingChat, startEndingChatTransition] = useTransition();
  const [partnerPresence, setPartnerPresence] = useState<"online" | "offline">(
    "offline"
  );
  const [partnerId, setPartnerId] = useState<string | null>(null); // Added this line
  // currentUserPrivateKey, partnerPublicKey will be initialized by useChatInitialization
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
  const [keyFingerprintEmojis, setKeyFingerprintEmojis] = useState<
    string[] | null
  >(null); // For safety emojis
  const [encryptionStatus, setEncryptionStatus] = useState<
    "pending" | "active" | "failed" | "inactive"
  >("pending");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // presenceChannelRef will be managed by useRealtimeEvents hook
  let pagePresenceChannelRef = useRef<any>(null); // Renamed to avoid conflict if hook returns a ref with same name

  // Use the custom hook for chat initialization
  const {
    isLoading: isInitializing, // Renamed to avoid conflict with component's own isLoading if any
    user: initializedUser,
    partnerId: initializedPartnerId,
    initialPartnerPublicKey,
    isChatActiveInitial,
    initialEncryptionStatus,
    currentUserPrivateKey: initializedCurrentUserPrivateKey,
    error: initializationError,
  } = useChatInitialization({ supabase, chatId, router });

  // Synchronize state from the initialization hook to the component's state
  useEffect(() => {
    if (initializedUser) setUser(initializedUser);
    if (initializedPartnerId) setPartnerId(initializedPartnerId);
    if (initialPartnerPublicKey) setPartnerPublicKey(initialPartnerPublicKey);
    setIsChatActive(isChatActiveInitial); // Always set, even if true by default
    if (initialEncryptionStatus) setEncryptionStatus(initialEncryptionStatus);
    if (initializedCurrentUserPrivateKey)
      setCurrentUserPrivateKey(initializedCurrentUserPrivateKey);

    // If there was an error during initialization that implies chat shouldn't be active
    if (
      initializationError &&
      (initialEncryptionStatus === "failed" || !isChatActiveInitial)
    ) {
      // Potentially set isChatActive to false here if not already handled by isChatActiveInitial
      // toast.error(`Initialization failed: ${initializationError}`); // Error is already toasted in the hook
    }
  }, [
    initializedUser,
    initializedPartnerId,
    initialPartnerPublicKey,
    isChatActiveInitial,
    initialEncryptionStatus,
    initializedCurrentUserPrivateKey,
    initializationError,
  ]);

  // Use the custom hook for encryption
  const {
    sharedSecretKey: derivedSharedSecretKey,
    keyFingerprintEmojis: derivedKeyFingerprintEmojis,
    encryptionStatusUpdate,
  } = useEncryption({
    currentUserPrivateKey,
    partnerPublicKey,
    isChatActive,
    chatId,
  });

  // Synchronize state from the encryption hook to the component's state
  useEffect(() => {
    if (derivedSharedSecretKey) setSharedSecretKey(derivedSharedSecretKey);
    if (derivedKeyFingerprintEmojis)
      setKeyFingerprintEmojis(derivedKeyFingerprintEmojis);

    // Logic to determine the final encryptionStatus based on initialization and ongoing updates
    if (!isChatActive) {
      setEncryptionStatus("inactive");
    } else if (
      initialEncryptionStatus === "failed" ||
      encryptionStatusUpdate === "failed"
    ) {
      setEncryptionStatus("failed");
    } else if (encryptionStatusUpdate === "active") {
      setEncryptionStatus("active");
    } else if (
      initialEncryptionStatus === "pending" ||
      encryptionStatusUpdate === "pending"
    ) {
      setEncryptionStatus("pending");
    }
    // If chat becomes inactive, encryption status should reflect that.
    // This might also be handled by the chat status subscription.
  }, [
    derivedSharedSecretKey,
    derivedKeyFingerprintEmojis,
    encryptionStatusUpdate,
    initialEncryptionStatus, // from useChatInitialization
    isChatActive, // from component state, updated by useChatInitialization and subscriptions
  ]);

  // Use the custom hook for message decryption
  const {
    decryptedMessages: initialDecryptedMessages,
    isLoadingMessages, // Can be used for a more specific loading indicator if needed
    messageLoadingError, // Can be used to display specific message loading errors
  } = useMessageDecryption({
    sharedSecretKey,
    isChatActive,
    chatId,
    supabase,
    currentEncryptionStatus: encryptionStatus, // Pass the component's current overall encryption status
  });

  // Synchronize messages from the decryption hook to the component's main messages state
  useEffect(() => {
    // Only update if the initialDecryptedMessages array has actually changed identity or content.
    // This basic check might need to be more sophisticated if partial updates are possible.
    if (initialDecryptedMessages) {
      // Check if messages are different before setting to avoid unnecessary re-renders if the hook returns the same array instance
      if (
        JSON.stringify(messages) !== JSON.stringify(initialDecryptedMessages)
      ) {
        setMessages(initialDecryptedMessages);
      }
    }
  }, [initialDecryptedMessages]); // Added messages to dependency to allow comparison

  // Display error from message decryption hook
  useEffect(() => {
    if (messageLoadingError) {
      toast.error(messageLoadingError);
    }
  }, [messageLoadingError]);

  // Scroll to bottom
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // --- Realtime Event Callbacks ---
  const handleNewDecryptedMessage = useCallback(
    (message: Message) => {
      setMessages([...messages, message]);
    },
    [messages]
  ); // No dependencies, setMessages is stable

  const handleChatEnded = useCallback(() => {
    toast.info("Chat ended.");
    setIsChatActive(false);
    setEncryptionStatus("inactive");
  }, [setIsChatActive, setEncryptionStatus]); // Add setters if they were passed from context or props, otherwise stable

  const handlePartnerPresenceChange = useCallback(
    (status: "online" | "offline") => {
      setPartnerPresence(status);
    },
    [setPartnerPresence]
  );

  const handlePartnerTypingChange = useCallback(
    (isTyping: boolean) => {
      setIsPartnerTyping(isTyping);
    },
    [setIsPartnerTyping]
  );

  // Use the custom hook for real-time events
  // Assign the returned ref to the component's ref
  pagePresenceChannelRef = useRealtimeEvents({
    supabase,
    chatId,
    isChatActive,
    user,
    partnerId,
    sharedSecretKey,
    onNewDecryptedMessage: handleNewDecryptedMessage,
    onChatEnded: handleChatEnded,
    onPartnerPresenceChange: handlePartnerPresenceChange,
    onPartnerTypingChange: handlePartnerTypingChange,
  });

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
    if (!isChatActive && pagePresenceChannelRef.current && user && partnerId) {
      // Use pagePresenceChannelRef
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (
        pagePresenceChannelRef.current && // Use pagePresenceChannelRef
        typeof pagePresenceChannelRef.current.send === "function"
      ) {
        pagePresenceChannelRef.current.send({
          // Use pagePresenceChannelRef
          type: "broadcast",
          event: "typing_stop",
          payload: { sender_id: user.id },
        });
      }
      setIsPartnerTyping(false);
    }
  }, [isChatActive, user, partnerId, pagePresenceChannelRef]); // Added pagePresenceChannelRef

  const handleTypingChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setNewMessage(event.target.value);

    if (!pagePresenceChannelRef.current || !user || !isChatActive || !partnerId)
      return; // Use pagePresenceChannelRef

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    pagePresenceChannelRef.current.send({
      // Use pagePresenceChannelRef
      type: "broadcast",
      event: "typing_start",
      payload: { sender_id: user.id },
    });

    typingTimeoutRef.current = setTimeout(() => {
      if (pagePresenceChannelRef.current && user && isChatActive) {
        // Use pagePresenceChannelRef
        pagePresenceChannelRef.current.send({
          // Use pagePresenceChannelRef
          type: "broadcast",
          event: "typing_stop",
          payload: { sender_id: user.id },
        });
      }
    }, 1500);
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
    if (pagePresenceChannelRef.current && user && isChatActive && partnerId) {
      // Use pagePresenceChannelRef
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      pagePresenceChannelRef.current.send({
        // Use pagePresenceChannelRef
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

  if (isInitializing) {
    // Use isLoading from the initialization hook
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
      </div>
    );
  }

  // Handling case where initialization might have failed critically before rendering chat UI
  if (!user && !isInitializing) {
    // If still no user after loading, likely a critical auth error
    return (
      <div className="flex flex-col justify-center items-center h-screen text-red-500">
        <p>Failed to initialize chat session.</p>
        <p>{initializationError || "Please try logging in again."}</p>
        <Button onClick={() => router.push("/login")} className="mt-4">
          Go to Login
        </Button>
      </div>
    );
  }

  return (
    <main className="flex h-[calc(93dvh)] flex-col items-center justify-center px-4 gap-4">
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
          {/* Safety Emojis Display */}
          {encryptionStatus === "active" && keyFingerprintEmojis && (
            <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400 p-1 bg-muted rounded-md">
              <span className="font-semibold">Verify:</span>
              {keyFingerprintEmojis.map((emoji, index) => (
                <span key={index} className="text-lg">
                  {" "}
                  {/* Increased emoji size */}
                  {emoji}
                </span>
              ))}
            </div>
          )}
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
                      className="flex flex-col"
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
