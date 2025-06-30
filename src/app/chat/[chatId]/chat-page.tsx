"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  Loader2, // Not used
  CornerDownLeft,
  Circle,
  Send,
  PhoneOff,
  Clock,
  Shield,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { encryptData, arrayBufferToBase64 } from "@/lib/crypto";
import { AnimatePresence, motion } from "framer-motion";
import { useChatInitialization } from "../../../hooks/useChatInitialization";
import { useEncryption } from "../../../hooks/useEncryption";
import { useMessageDecryption } from "../../../hooks/useMessageDecryption";
import { useRealtimeEvents } from "../../../hooks/useRealtimeEvents"; // Import the new hook
import { Chat, Profile } from "@/types";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";
import AppHeader from "@/components/layout/header";

// mapHashToEmojis is now imported from @/lib/crypto

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface Props {
  user: User;
  chat: Chat;
  partnerProfile: Profile;
}

export default function ChatRoomPage({ user, chat, partnerProfile }: Props) {
  const supabase = createClient();
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
  const partnerId = partnerProfile.id; // Added this line
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
  let pagePresenceChannelRef = useRef<RealtimeChannel | null>(null); // Renamed to avoid conflict if hook returns a ref with same name

  // Use the custom hook for chat initialization
  const {
    partnerId: initializedPartnerId,
    initialPartnerPublicKey,
    initialEncryptionStatus,
    currentUserPrivateKey: initializedCurrentUserPrivateKey,
    error: initializationError,
  } = useChatInitialization({ user, chat, partnerProfile });

  // Synchronize state from the initialization hook to the component's state
  useEffect(() => {
    if (initialPartnerPublicKey) setPartnerPublicKey(initialPartnerPublicKey);
    if (initialEncryptionStatus) setEncryptionStatus(initialEncryptionStatus);
    if (initializedCurrentUserPrivateKey)
      setCurrentUserPrivateKey(initializedCurrentUserPrivateKey);

    // If there was an error during initialization that implies chat shouldn't be active
    if (initializationError && initialEncryptionStatus === "failed") {
      // Potentially set isChatActive to false here if not already handled by isChatActiveInitial
      // toast.error(`Initialization failed: ${initializationError}`); // Error is already toasted in the hook
    }
  }, [
    initializedPartnerId,
    initialPartnerPublicKey,
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
    chatId: chat.id,
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
    decryptedMessages: initialDecryptedMessages, // Can be used for a more specific loading indicator if needed
    messageLoadingError, // Can be used to display specific message loading errors
  } = useMessageDecryption({
    sharedSecretKey,
    isChatActive,
    chatId: chat.id,
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
  }, [initialDecryptedMessages, messages]); // Added messages to dependency to allow comparison

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
    chatId: chat.id,
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

  const handleSendMessage = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }
    if (
      !newMessage.trim() ||
      !user ||
      !chat ||
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
            chat_id: chat.id,
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

  const handleEndChat = () => {
    if (!chat || !isChatActive) return;
    startEndingChatTransition(async () => {
      const { error } = await supabase
        .from("chats")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", chat.id);
      if (error) {
        toast.error("Failed to end chat session.");
        setIsChatActive(true);
      }
      // Realtime update should handle UI changes for both users
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      {/* Header */}
      <AppHeader />

      {/* Chat Container */}
      <div className="container mx-auto px-4 py-6 max-w-4xl h-[calc(100vh-80px)]">
        <div className="flex items-center space-x-4 mb-2">
          {/* Partner Status */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <UserIcon className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">Partner:</span>
            </div>
            <div className="flex items-center space-x-1">
              <Circle
                className={`w-3 h-3 ${
                  partnerPresence === "online"
                    ? "fill-green-500 text-green-500"
                    : "fill-gray-400 text-gray-400"
                }`}
              />
              <Badge
                variant={partnerPresence === "online" ? "default" : "secondary"}
                className="text-xs"
              >
                {partnerPresence}
              </Badge>
            </div>
          </div>

          {/* Encryption Status */}
          <div className="flex items-center space-x-2">
            {encryptionStatus === "active" ? (
              <ShieldCheck className="w-4 h-4 text-green-600" />
            ) : (
              <Shield className="w-4 h-4 text-gray-400" />
            )}
            <Badge
              variant={encryptionStatus === "active" ? "default" : "secondary"}
              className={`text-xs ${
                encryptionStatus === "active"
                  ? "bg-green-100 text-green-700"
                  : encryptionStatus === "failed"
                  ? "bg-red-100 text-red-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {encryptionStatus === "active" && "E2E Encrypted"}
              {encryptionStatus === "pending" && "Encrypting..."}
              {encryptionStatus === "failed" && "Encryption Failed"}
              {encryptionStatus === "inactive" && "Chat Ended"}
            </Badge>
          </div>

          {/* Key Verification */}
          {encryptionStatus === "active" && keyFingerprintEmojis && (
            <div className="flex items-center space-x-1 px-2 py-1 bg-green-50 rounded-md border border-green-200">
              <span className="text-xs font-medium text-green-700">
                Verify:
              </span>
              <div className="flex space-x-1">
                {keyFingerprintEmojis.map((emoji, index) => (
                  <span key={index} className="text-sm">
                    {emoji}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <Card className="h-full shadow-md  border-gray-50 bg-white/80 overflow-hidden">
          <CardContent className="p-0 h-full flex flex-col">
            {/* Messages Area */}
            <div
              className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar "
              ref={messagesContainerRef}
            >
              <AnimatePresence>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${
                      message.sender_id === user?.id
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                        message.sender_id === user?.id
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">
                        {message.content}
                      </p>
                      <div className="flex items-center justify-end mt-2 space-x-1">
                        <Clock className="w-3 h-3 opacity-70" />
                        <span className="text-xs opacity-70">
                          {formatTime(message.created_at)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Typing Indicator */}
              {isPartnerTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex justify-start"
                >
                  <div className="bg-gray-100 px-4 py-3 rounded-2xl">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t bg-gray-50/50 p-6">
              <form onSubmit={handleSendMessage} className="space-y-4">
                <div className="relative">
                  <Textarea
                    ref={inputRef}
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTypingChange(e);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      isChatActive
                        ? "Type your message here..."
                        : "Chat has ended"
                    }
                    disabled={!isChatActive}
                    className="min-h-[60px] resize-none border-gray-200 focus:border-purple-500 focus:ring-purple-500 bg-white"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!isChatActive || isEndingChat}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {isEndingChat ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <PhoneOff className="w-4 h-4 mr-2" />
                        )}
                        End Chat
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>End Chat?</AlertDialogTitle>
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
                          onClick={handleEndChat}
                          disabled={isEndingChat}
                          className="bg-red-500 hover:bg-red-600"
                        >
                          {isEndingChat && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          End Chat
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Button
                    type="submit"
                    disabled={
                      !isChatActive || !newMessage.trim() || isSendingMessage
                    }
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    {isSendingMessage ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Send Message
                    <CornerDownLeft className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
