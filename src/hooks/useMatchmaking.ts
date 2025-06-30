"use client";

import { useRef, useCallback } from "react";
import type {
  SupabaseClient,
  User,
  RealtimeChannel,
} from "@supabase/supabase-js";
import { toast } from "sonner";
import { FindChatStatus, Profile } from "@/types";

interface UseMatchmakingProps {
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
  onMatchFound: (chatId: string) => void;
  onStatusChange: (status: FindChatStatus) => void;
  onSearchError: (errorMessage: string) => void;
}

interface UseMatchmakingResult {
  startSearch: () => Promise<void>;
  stopSearch: (notifyLeaveQueue?: boolean) => Promise<void>;
}

export function useMatchmaking({
  supabase,
  user,
  profile,
  onMatchFound,
  onStatusChange,
  onSearchError,
}: UseMatchmakingProps): UseMatchmakingResult {
  const searchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  const cleanupListeners = useCallback(() => {
    if (searchIntervalRef.current) {
      clearInterval(searchIntervalRef.current);
      searchIntervalRef.current = null;
      console.log("Cleared search polling interval.");
    }
    if (realtimeChannelRef.current) {
      console.log("Removing chat creation listener channel.");
      supabase
        .removeChannel(realtimeChannelRef.current)
        .then(() =>
          console.log("Successfully removed chat creation listener channel.")
        )
        .catch((err) =>
          console.error("Error removing chat creation listener channel:", err)
        );
      realtimeChannelRef.current = null;
    }
  }, [supabase]);

  const setupRealtimeListener = useCallback(() => {
    if (!user?.id) return;

    // Ensure previous channel is removed if any
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    console.log(
      `Setting up realtime listener for chat creation involving user ${user.id}`
    );
    const channel = supabase
      .channel(`user_match_listener_${user.id}_${Date.now()}`) // Unique channel name
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chats",
          filter: `user1_id=eq.${user.id}`,
        },
        (payload) => {
          console.log(
            "Realtime: Chat creation detected (user as user1):",
            payload
          );
          const newChat = payload.new as { id: string };
          cleanupListeners();
          onStatusChange("matched");
          onMatchFound(newChat.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chats",
          filter: `user2_id=eq.${user.id}`,
        },
        (payload) => {
          console.log(
            "Realtime: Chat creation detected (user as user2):",
            payload
          );
          const newChat = payload.new as { id: string };
          cleanupListeners();
          onStatusChange("matched");
          onMatchFound(newChat.id);
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log(
            `Subscribed to chat creation listener for user ${user.id}`
          );
          realtimeChannelRef.current = channel;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Chat creation listener error/timeout:", err || status);
          onSearchError("Error listening for matches. Please try again.");
          cleanupListeners(); // Cleanup on error
        }
      });
    realtimeChannelRef.current = channel; // Assign immediately
  }, [
    user?.id,
    supabase,
    cleanupListeners,
    onMatchFound,
    onSearchError,
    onStatusChange,
  ]);

  const startSearch = useCallback(async () => {
    if (!user || !profile || !profile.mbti_type) {
      onSearchError("User profile is not complete or user not logged in.");
      return;
    }

    onStatusChange("searching");
    cleanupListeners(); // Clear any previous state

    try {
      console.log("Attempting to join queue...");
      const { error: joinError } = await supabase.functions.invoke(
        "join-queue",
        {
          body: {
            mbti_type: profile.mbti_type,
            interested_mbti_types: profile.interested_mbti_types || [],
          },
        }
      );
      if (joinError)
        throw new Error(`Failed to join queue: ${joinError.message}`);
      console.log("Joined queue successfully.");

      setupRealtimeListener(); // Setup listener *after* joining queue

      console.log("Performing immediate match check...");
      const { data: matchData, error: matchError } =
        await supabase.functions.invoke("find-match", {
          body: { userId: user.id }, // Ensure userId is passed if required by your function
        });

      if (matchError)
        throw new Error(`Matchmaking error: ${matchError.message}`);

      if (matchData?.chatId) {
        console.log("Immediate match found:", matchData.chatId);
        cleanupListeners();
        onStatusChange("matched");
        onMatchFound(matchData.chatId);
      } else {
        console.log("No immediate match. Setting up polling interval...");
        searchIntervalRef.current = setInterval(async () => {
          if (!user) {
            // Check user in interval, might have logged out
            cleanupListeners();
            return;
          }
          console.log("Polling for match...");
          try {
            const { data: pollData, error: pollError } =
              await supabase.functions.invoke("find-match", {
                body: { userId: user.id }, // Ensure userId is passed
              });
            if (pollError) {
              console.error("Polling error:", pollError.message);
              // Don't stop polling on transient errors, but log them.
              // If it's a persistent error, the user might cancel.
              return;
            }
            if (pollData?.chatId) {
              console.log("Match found via polling:", pollData.chatId);
              cleanupListeners();
              onStatusChange("matched");
              onMatchFound(pollData.chatId);
            } else {
              console.log("Still no match found via polling.");
            }
          } catch (intervalError: unknown) {
            console.error(
              "Critical error inside polling interval:",
              intervalError
            );
            onSearchError("An error occurred while searching.");
            cleanupListeners();
          }
        }, 7000); // Poll every 7 seconds
      }
    } catch (error: unknown) {
      console.error("Error in startSearch:", error);
      onSearchError("An error occurred during matchmaking.");
      cleanupListeners();
    }
  }, [
    user,
    profile,
    supabase,
    cleanupListeners,
    setupRealtimeListener,
    onMatchFound,
    onStatusChange,
    onSearchError,
  ]);

  const stopSearch = useCallback(
    async (notifyLeaveQueue = true) => {
      cleanupListeners();
      onStatusChange("idle"); // Set status to idle after stopping

      if (notifyLeaveQueue && user) {
        // Only call leave-queue if user exists
        console.log("Attempting to leave queue...");
        try {
          const { error } = await supabase.functions.invoke("leave-queue");
          if (error) {
            console.error("Error leaving queue:", error.message);
            toast.error(
              "Failed to leave search queue. You might have already been removed or matched."
            );
          } else {
            toast.info("Search cancelled and left queue.");
          }
        } catch (cancelError: unknown) {
          console.error("Error invoking leave-queue function:");
          console.log(cancelError);
          toast.error("Failed to properly cancel search on the server.");
        }
      } else if (notifyLeaveQueue && !user) {
        console.log("User not available, skipping leave-queue call.");
      }
    },
    [supabase, user, cleanupListeners, onStatusChange]
  );

  return { startSearch, stopSearch };
}
