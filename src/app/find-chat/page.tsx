"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation"; // Import useRouter for redirection

type FindStatus = "idle" | "searching" | "error";

export default function FindChatPage() {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{
    mbti_type: string | null;
    interested_mbti_types: string[] | null;
  } | null>(null);
  const [status, setStatus] = useState<FindStatus>("idle");
  const searchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isFindingChat, startFindingChatTransition] = useTransition();
  const [isCancellingSearch, startCancellingSearchTransition] = useTransition();
  const realtimeChannelRef = useRef<any>(null); // Ref to store realtime channel

  // Fetch user and profile
  useEffect(() => {
    const fetchUserAndProfile = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) {
        toast.error("You must be logged in.");
        router.push("/login"); // Redirect if not logged in
        return;
      }
      setUser(currentUser);

      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("mbti_type, interested_mbti_types")
        .eq("id", currentUser.id)
        .single();

      if (profileError || !userProfile || !userProfile.mbti_type) {
        toast.error("Please set your MBTI type on the profile page first.");
        router.push("/profile"); // Redirect to profile if not set
        return;
      }
      setProfile(userProfile);
    };
    fetchUserAndProfile();
  }, [supabase, router]);

  // Function to stop polling and unsubscribe from realtime listener
  const stopSearchingAndCleanup = useCallback(() => {
    if (searchIntervalRef.current) {
      clearInterval(searchIntervalRef.current);
      searchIntervalRef.current = null;
      console.log("Stopped search polling.");
    }
    if (realtimeChannelRef.current) {
      console.log("Unsubscribing from chat creation listener");
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  }, [supabase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSearchingAndCleanup();
    };
  }, [stopSearchingAndCleanup]);

  // Realtime subscription for being matched
  useEffect(() => {
    if (status !== "searching" || !user?.id) {
      // Ensure cleanup if status changes away from searching
      if (realtimeChannelRef.current) stopSearchingAndCleanup();
      return;
    }

    console.log(
      `Setting up listener for chat creation involving user ${user.id}`
    );
    const channel = supabase
      .channel(`user_match_listener_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chats",
          filter: `user1_id=eq.${user.id}`,
        },
        (payload) => {
          console.log(`Chat creation detected (user as user1):`, payload);
          const newChat = payload.new as { id: string };
          stopSearchingAndCleanup();
          toast.success("Match found!");
          router.push(`/chat/${newChat.id}`); // Redirect to chat page
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
          console.log(`Chat creation detected (user as user2):`, payload);
          const newChat = payload.new as { id: string };
          stopSearchingAndCleanup();
          toast.success("Match found!");
          router.push(`/chat/${newChat.id}`); // Redirect to chat page
        }
      )
      .subscribe((subStatus, err) => {
        if (subStatus === "SUBSCRIBED") {
          console.log(
            `Subscribed to chat creation listener for user ${user.id}`
          );
          realtimeChannelRef.current = channel; // Store channel reference
        }
        if (subStatus === "CHANNEL_ERROR") {
          console.error("Chat creation listener error:", err);
          toast.error("Error listening for matches. Please try again.");
          setStatus("error");
          stopSearchingAndCleanup();
        }
      });

    // Return cleanup function
    return () => {
      if (realtimeChannelRef.current) {
        console.log(
          `Unsubscribing from chat creation listener for user ${user.id}`
        );
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [status, user?.id, supabase, stopSearchingAndCleanup, router]);

  // Find Chat Handler
  const handleFindChat = useCallback(async () => {
    if (!user || !profile) return; // Guard clauses

    startFindingChatTransition(async () => {
      setStatus("searching");
      stopSearchingAndCleanup(); // Clear previous state

      try {
        // Join Queue
        const { error: joinError } = await supabase.functions.invoke(
          "join-queue",
          {
            body: {
              mbti_type: profile.mbti_type!,
              interested_mbti_types: profile.interested_mbti_types || [],
            },
          }
        );
        if (joinError)
          throw new Error(`Failed to join queue: ${joinError.message}`);
        console.log("Joined queue successfully.");

        // Immediate Match Check
        const { data: matchData, error: matchError } =
          await supabase.functions.invoke("find-match", {
            body: { userId: user.id },
          });
        if (matchError)
          throw new Error(`Matchmaking error: ${matchError.message}`);

        if (matchData?.chatId) {
          stopSearchingAndCleanup();
          toast.success("Match found!");
          router.push(`/chat/${matchData.chatId}`); // Redirect immediately
        } else {
          // Start Polling if no immediate match
          console.log("No immediate match found, starting polling...");
          searchIntervalRef.current = setInterval(async () => {
            if (!user) {
              stopSearchingAndCleanup();
              return;
            } // Check user in interval
            console.log("Polling for match...");
            try {
              const { data: pollData, error: pollError } =
                await supabase.functions.invoke("find-match", {
                  body: { userId: user.id },
                });
              if (pollError) {
                console.error("Polling error:", pollError.message);
                return;
              }

              if (pollData?.chatId) {
                stopSearchingAndCleanup();
                toast.success("Match found!");
                router.push(`/chat/${pollData.chatId}`); // Redirect on poll success
              } else {
                console.log("Still no match found via polling.");
              }
            } catch (intervalError: any) {
              console.error("Error inside polling interval:", intervalError);
              toast.error("An error occurred while searching.");
              setStatus("error");
              stopSearchingAndCleanup();
            }
          }, 7000); // Poll every 7 seconds
        }
      } catch (error: any) {
        console.error("Error finding chat:", error);
        toast.error(error.message || "An error occurred during matchmaking.");
        setStatus("error");
        stopSearchingAndCleanup();
      }
    });
  }, [
    user,
    profile,
    supabase,
    stopSearchingAndCleanup,
    startFindingChatTransition,
    router,
  ]);

  // Cancel Search Handler
  const handleCancelSearch = useCallback(async () => {
    startCancellingSearchTransition(async () => {
      stopSearchingAndCleanup();
      setStatus("idle");
      console.log("Cancelling search...");
      try {
        const { error } = await supabase.functions.invoke("leave-queue");
        if (error) {
          console.error("Error leaving queue:", error.message);
          toast.error("Failed to leave search queue.");
        } else {
          toast.info("Search cancelled.");
        }
      } catch (cancelError: any) {
        console.error(
          "Error invoking leave-queue function:",
          cancelError.message
        );
        toast.error("Failed to cancel search.");
      }
    });
  }, [supabase, stopSearchingAndCleanup, startCancellingSearchTransition]);

  return (
    // Adjusted top padding for mobile
    <div className="container mx-auto p-4 flex flex-col items-center justify-center pt-10 md:pt-16">
      {/* Adjusted heading size for mobile */}
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-center">
        Find a Chat Partner
      </h1>

      {/* Display User Preferences */}
      {profile && (
        <div className="mb-8 p-4 border rounded-lg bg-gray-100 dark:bg-gray-800 shadow-sm w-full max-w-md text-center">
          <h2 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">
            Your Preferences
          </h2>
          <p className="mb-2">
            <span className="font-medium">Your MBTI Type:</span>{" "}
            <span className="inline-block bg-blue-100 text-blue-800 text-sm font-medium me-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
              {profile.mbti_type || "Not Set"}
            </span>
          </p>
          <p>
            <span className="font-medium">Interested in Types:</span>{" "}
            {profile.interested_mbti_types &&
            profile.interested_mbti_types.length > 0 ? (
              profile.interested_mbti_types.map((type) => (
                <span
                  key={type}
                  className="inline-block bg-purple-100 text-purple-800 text-sm font-medium me-2 px-2.5 py-0.5 rounded dark:bg-purple-900 dark:text-purple-300"
                >
                  {type}
                </span>
              ))
            ) : (
              <span className="text-gray-500 italic">Any</span>
            )}
          </p>
          <Button
            variant="link"
            size="sm"
            className="mt-2"
            onClick={() => router.push("/profile")}
          >
            Change Preferences
          </Button>
        </div>
      )}

      {/* Search Controls */}
      {status === "idle" && (
        <Button
          onClick={handleFindChat}
          disabled={!profile || isFindingChat}
          size="lg"
        >
          {isFindingChat ? "Starting..." : "Start Searching"}
        </Button>
      )}

      {status === "searching" && (
        <div className="text-center flex flex-col items-center gap-4">
          <p className="text-lg">Searching for a compatible chat partner...</p>
          <Loader2 className="h-10 w-10 animate-spin text-gray-500 my-4" />
          <Button
            variant="outline"
            onClick={handleCancelSearch}
            disabled={isCancellingSearch}
          >
            {isCancellingSearch ? "Cancelling..." : "Cancel Search"}
          </Button>
        </div>
      )}

      {status === "error" && (
        <div className="text-center flex flex-col items-center gap-4">
          <p className="text-red-500 mb-4">
            An error occurred. Please try again.
          </p>
          <Button onClick={handleFindChat} disabled={!profile || isFindingChat}>
            {isFindingChat ? "Starting..." : "Try Again"}
          </Button>
        </div>
      )}
    </div>
  );
}
