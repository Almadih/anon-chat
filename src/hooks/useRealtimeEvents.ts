"use client";

import { useEffect, useRef } from "react";
import type { SupabaseClient, User, RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { decryptData, base64ToArrayBuffer } from "@/lib/crypto";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface UseRealtimeEventsProps {
  supabase: SupabaseClient;
  chatId: string;
  isChatActive: boolean;
  user: User | null;
  partnerId: string | null;
  sharedSecretKey: CryptoKey | null;
  onNewDecryptedMessage: (message: Message) => void;
  onChatEnded: () => void;
  onPartnerPresenceChange: (status: "online" | "offline") => void;
  onPartnerTypingChange: (isTyping: boolean) => void;
}

export function useRealtimeEvents({
  supabase,
  chatId,
  isChatActive,
  user,
  partnerId,
  sharedSecretKey,
  onNewDecryptedMessage,
  onChatEnded,
  onPartnerPresenceChange,
  onPartnerTypingChange,
}: UseRealtimeEventsProps): React.MutableRefObject<RealtimeChannel | null> {
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!chatId || !isChatActive || !user || !partnerId || !supabase) {
      // If essential props are missing or chat is inactive, remove all channels
      // This cleanup is important if props change making the conditions false
      const channelsToRemove: RealtimeChannel[] = [];
      if (presenceChannelRef.current) channelsToRemove.push(presenceChannelRef.current);
      // Potentially store refs to message and chatStatus channels if they need individual removal
      // For now, removeAllChannels is a broader approach if specific refs aren't kept
      if (channelsToRemove.length > 0) {
        Promise.all(channelsToRemove.map(channel => supabase.removeChannel(channel)))
          .then(() => {
            // console.log("Cleaned up specific channels due to changed conditions/inactivity for chat:", chatId);
          })
          .catch((error: any) => {
            console.error("Error cleaning up channels:", error);
          });
        presenceChannelRef.current = null;
      }
      return;
    }

    let messageChannel: RealtimeChannel | null = null;
    let chatStatusChannel: RealtimeChannel | null = null;

    // --- Presence Channel Setup ---
    // Ensure existing presence channel is removed before creating a new one if dependencies change
    if (presenceChannelRef.current && presenceChannelRef.current.topic !== `chat_presence_${chatId}`) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
    }
    
    if (!presenceChannelRef.current) {
        presenceChannelRef.current = supabase.channel(`chat_presence_${chatId}`, {
          config: {
            presence: {
              key: user.id,
            },
          },
        });
    }
    
    presenceChannelRef.current
      .on("presence", { event: "sync" }, () => {
        if (presenceChannelRef.current && partnerId) {
          const presences = presenceChannelRef.current.presenceState();
          const partnerIsOnline = Object.keys(presences).includes(partnerId);
          onPartnerPresenceChange(partnerIsOnline ? "online" : "offline");
        }
      })
      .on("presence", { event: "join" }, ({ key }) => {
        if (key === partnerId) onPartnerPresenceChange("online");
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key === partnerId) onPartnerPresenceChange("offline");
      })
      .on("broadcast", { event: "typing_start" }, ({ payload }) => {
        if (payload.sender_id === partnerId) onPartnerTypingChange(true);
      })
      .on("broadcast", { event: "typing_stop" }, ({ payload }) => {
        if (payload.sender_id === partnerId) onPartnerTypingChange(false);
      })
      .subscribe(async (status, err) => {
        if (status === "SUBSCRIBED") {
          await presenceChannelRef.current?.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        } else if (status === "CHANNEL_ERROR") {
          toast.error(`Presence connection error for chat ${chatId}.`);
          console.error(`Presence channel error for ${chatId}:`, err);
        }
      });

    // --- Message Subscription ---
    messageChannel = supabase
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
          const newMessageReceived = payload.new as Message;
          if (newMessageReceived.sender_id === user.id) {
            // Optimistic updates handle user's own messages, so ignore them here
            // Or, if not using optimistic updates for own messages, decrypt and add
            return; 
          }

          if (sharedSecretKey) {
            try {
              const decryptedContent = await decryptData(
                sharedSecretKey,
                base64ToArrayBuffer(newMessageReceived.content)
              );
              onNewDecryptedMessage({ ...newMessageReceived, content: decryptedContent });
            } catch (e) {
              console.error("Failed to decrypt incoming message with shared key:", e);
              onNewDecryptedMessage({ ...newMessageReceived, content: "[Message undecryptable]" });
            }
          } else {
            console.warn("Received message but shared key is not available for decryption.");
            onNewDecryptedMessage({ ...newMessageReceived, content: "[Decrypting... Key not ready]" });
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          toast.error(`Message connection error for chat ${chatId}.`);
          console.error(`Message channel error for ${chatId}:`, err);
        }
      });

    // --- Chat Status (End) Subscription ---
    chatStatusChannel = supabase
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
            onChatEnded();
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          toast.error(`Chat status connection error for chat ${chatId}.`);
          console.error(`Chat status channel error for ${chatId}:`, err);
        }
      });

    return () => {
      const channelsToClean: RealtimeChannel[] = [];
      if (messageChannel) channelsToClean.push(messageChannel);
      if (chatStatusChannel) channelsToClean.push(chatStatusChannel);
      
      // Only untrack and remove presence channel if it's currently set
      // and its topic matches the current chatId to avoid issues during rapid chatId changes.
      if (presenceChannelRef.current && presenceChannelRef.current.topic === `chat_presence_${chatId}`) {
        const presChannel = presenceChannelRef.current;
        channelsToClean.push(presChannel); // Add for removal by removeChannels
        presenceChannelRef.current = null; // Clear the ref
        // Untrack must happen before removeChannel for presence
        presChannel.untrack()
          .catch((err: any) => console.error(`Error untracking presence for chat ${chatId}:`, err))
          .finally(() => {
            // supabase.removeChannel(presChannel) // This will be handled by removeChannels
          });
      }
      
      if (channelsToClean.length > 0) {
        Promise.all(channelsToClean.map(channel => supabase.removeChannel(channel)))
          .then(() => { /* console.log("Cleaned up channels for chat:", chatId); */ })
          .catch((err: any) => console.error(`Error removing channels for chat ${chatId}:`, err));
      }
    };
  }, [
    supabase,
    chatId,
    isChatActive,
    user,
    partnerId,
    sharedSecretKey,
    onNewDecryptedMessage,
    onChatEnded,
    onPartnerPresenceChange,
    onPartnerTypingChange,
  ]);

  return presenceChannelRef;
}
