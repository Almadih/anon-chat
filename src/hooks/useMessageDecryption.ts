"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptData, base64ToArrayBuffer } from "@/lib/crypto";

interface Message {
  id: string;
  sender_id: string;
  content: string; // This will store the decrypted content
  created_at: string;
  // Add any other raw message fields if needed, e.g., original encrypted content for debugging
}

interface UseMessageDecryptionProps {
  sharedSecretKey: CryptoKey | null;
  isChatActive: boolean;
  chatId: string;
  supabase: SupabaseClient;
  currentEncryptionStatus: "pending" | "active" | "failed" | "inactive";
}

interface UseMessageDecryptionResult {
  decryptedMessages: Message[];
  isLoadingMessages: boolean;
  messageLoadingError: string | null;
}

export function useMessageDecryption({
  sharedSecretKey,
  isChatActive,
  chatId,
  supabase,
  currentEncryptionStatus,
}: UseMessageDecryptionProps): UseMessageDecryptionResult {
  const [decryptedMessages, setDecryptedMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageLoadingError, setMessageLoadingError] = useState<string | null>(
    null
  );

  useEffect(() => {
    let isMounted = true;

    const loadAndDecryptMessages = async () => {
      if (!isMounted) return;

      if (!sharedSecretKey || !isChatActive) {
        if (isChatActive && currentEncryptionStatus === "failed") {
          // If chat is active but encryption has definitively failed (not just pending)
           toast.error("Cannot load messages: Secure session not established or failed.");
        }
        // Clear messages if keys are not available or chat is inactive
        setDecryptedMessages([]);
        return;
      }
      
      // Only proceed if encryption is active
      if (currentEncryptionStatus !== "active") {
        if (currentEncryptionStatus === "failed") {
            // toast.error("Encryption failed, cannot display messages securely.");
        }
        // Do not attempt to load messages if encryption isn't active
        setDecryptedMessages([]); 
        return;
      }

      setIsLoadingMessages(true);
      setMessageLoadingError(null);

      const { data: initialMessagesRaw, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (!isMounted) return;

      if (messagesError) {
        toast.error("Failed to load chat messages.");
        setMessageLoadingError("Failed to load messages.");
        setDecryptedMessages([]); // Clear messages on error
      } else if (initialMessagesRaw) {
        const newDecryptedMessages: Message[] = [];
        for (const msg of initialMessagesRaw) {
          try {
            // Ensure msg.content is a string before trying to decrypt
            if (typeof msg.content !== 'string') {
              console.warn(`Message ${msg.id} has invalid content format, skipping decryption.`);
              newDecryptedMessages.push({
                ...msg,
                content: "[Invalid message format]", 
              });
              continue;
            }
            const decryptedContent = await decryptData(
              sharedSecretKey,
              base64ToArrayBuffer(msg.content)
            );
            newDecryptedMessages.push({ ...msg, content: decryptedContent });
          } catch (e) {
            console.error(
              `Failed to decrypt message ${msg.id} with shared key:`,
              e
            );
            newDecryptedMessages.push({
              ...msg,
              content: "[Message undecryptable]",
            });
          }
        }
        if (isMounted) setDecryptedMessages(newDecryptedMessages);
      } else {
        // if (isMounted) setDecryptedMessages([]); // No messages found
      }
      if (isMounted) setIsLoadingMessages(false);
    };

    // Trigger loading when sharedSecretKey is available, chat is active, and encryption status is active
    if (chatId && supabase && isChatActive && sharedSecretKey && currentEncryptionStatus === "active") {
      loadAndDecryptMessages();
    } else if (currentEncryptionStatus === "failed" || currentEncryptionStatus === "inactive") {
      // If chat becomes inactive or encryption fails, clear messages
      if (isMounted) {
        setIsLoadingMessages(false);
      }
    }


    return () => {
      isMounted = false;
    };
  }, [
    sharedSecretKey,
    isChatActive,
    chatId,
    supabase,
    currentEncryptionStatus,
  ]);

  return { decryptedMessages, isLoadingMessages, messageLoadingError };
}
