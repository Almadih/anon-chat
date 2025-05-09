"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUserProfileData } from "@/hooks/useUserProfileData";
import { useMatchmaking } from "@/hooks/useMatchmaking"; // Import the new hook

type FindStatus = "idle" | "searching" | "error" | "matched";

export default function FindChatPage() {
  const supabase = createClient();
  const router = useRouter();
  const [status, setStatus] = useState<FindStatus>("idle");
  const [isFindingChat, startFindingChatTransition] = useTransition(); // For UI feedback on button
  const [isCancellingSearch, startCancellingSearchTransition] = useTransition(); // For UI feedback on button

  // Use the custom hook to fetch user and profile data
  const {
    user,
    profile,
    isLoading: isLoadingProfile,
    // error: profileError, // Can be used if needed
  } = useUserProfileData({ supabase, router });

  // --- Matchmaking Callbacks ---
  const handleMatchFound = useCallback(
    (chatId: string) => {
      toast.success("Match found!");
      router.push(`/chat/${chatId}`);
    },
    [router]
  );

  const handleStatusChange = useCallback((newStatus: FindStatus) => {
    setStatus(newStatus);
  }, []);

  const handleSearchError = useCallback((errorMessage: string) => {
    toast.error(errorMessage);
    setStatus("error"); // Set status to error to allow retry
  }, []);

  // Use the custom hook for matchmaking logic
  const { startSearch, stopSearch } = useMatchmaking({
    supabase,
    user,
    profile,
    onMatchFound: handleMatchFound,
    onStatusChange: handleStatusChange,
    onSearchError: handleSearchError,
  });

  // Cleanup on unmount - ensure stopSearch is called to clear intervals/listeners
  useEffect(() => {
    return () => {
      // Call stopSearch with false to prevent calling leave-queue if the component unmounts
      // e.g. user navigates away. leave-queue should be explicit via cancel button.
      if (status === "searching") {
        // Only stop if actively searching
        stopSearch(false);
      }
    };
  }, [stopSearch, status]);

  // Find Chat Handler
  const handleFindChat = useCallback(() => {
    if (!user || !profile || !profile.mbti_type) {
      toast.error(
        "Please ensure your profile is complete (especially MBTI type)."
      );
      return;
    }
    startFindingChatTransition(() => {
      startSearch(); // This is now an async function from the hook
    });
  }, [user, profile, startSearch, startFindingChatTransition]);

  // Cancel Search Handler
  const handleCancelSearch = useCallback(() => {
    startCancellingSearchTransition(async () => {
      await stopSearch(true); // true to notify leave-queue
      // Status is set to 'idle' by stopSearch via onStatusChange
    });
  }, [stopSearch, startCancellingSearchTransition]);

  // Display loading state while user/profile data is being fetched
  if (isLoadingProfile) {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center pt-10 md:pt-16">
        <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
        <p className="mt-4 text-gray-600">Loading your profile...</p>
      </div>
    );
  }

  // The hook useUserProfileData handles redirection if user is not logged in or profile is incomplete.
  // If it returns a profileError and hasn't redirected, it might be a non-critical error,
  // but the UI below should gracefully handle cases where profile might still be null.

  return (
    // Adjusted top padding for mobile
    <div className="container mx-auto p-4 flex flex-col items-center justify-center pt-10 md:pt-16">
      {/* Adjusted heading size for mobile */}
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-center">
        Find a Chat Partner
      </h1>

      {/* Display User Preferences */}
      {profile &&
        profile.mbti_type && ( // Ensure mbti_type exists before rendering this block
          <div className="mb-8 p-4 border rounded-lg bg-gray-100 dark:bg-gray-800 shadow-sm w-full max-w-md text-center">
            <h2 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">
              Your Preferences
            </h2>
            <p className="mb-2">
              <span className="font-medium">Your MBTI Type:</span>{" "}
              <span className="inline-block bg-blue-100 text-blue-800 text-sm font-medium me-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
                {profile.mbti_type}
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

      {!profile?.mbti_type &&
        !isLoadingProfile && ( // If profile is loaded but mbti_type is still missing
          <div className="mb-8 p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-900 shadow-sm w-full max-w-md text-center">
            <p className="text-yellow-700 dark:text-yellow-300">
              Please set your MBTI type on your profile page to start searching.
            </p>
            <Button
              variant="link"
              size="sm"
              className="mt-2 text-yellow-700 dark:text-yellow-300"
              onClick={() => router.push("/profile")}
            >
              Go to Profile
            </Button>
          </div>
        )}

      {/* Search Controls */}
      {status === "idle" && (
        <Button
          onClick={handleFindChat}
          disabled={!profile || !profile.mbti_type || isFindingChat} // Disable if profile or mbti_type is missing
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
