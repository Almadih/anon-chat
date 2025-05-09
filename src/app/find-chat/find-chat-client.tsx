"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
// import type { User } from "@supabase/supabase-js"; // User type might not be directly needed here if passed as prop or handled by hook
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUserProfileData } from "@/hooks/useUserProfileData";
import { useMatchmaking } from "@/hooks/useMatchmaking";

type FindStatus = "idle" | "searching" | "error" | "matched";

export default function FindChatClientPage() {
  const supabase = createClient();
  const router = useRouter();
  const [status, setStatus] = useState<FindStatus>("idle");
  const [isFindingChat, startFindingChatTransition] = useTransition();
  const [isCancellingSearch, startCancellingSearchTransition] = useTransition();

  const {
    user,
    profile,
    isLoading: isLoadingProfile,
    // error: profileError,
  } = useUserProfileData({ supabase, router });

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
    setStatus("error");
  }, []);

  const { startSearch, stopSearch } = useMatchmaking({
    supabase,
    user,
    profile,
    onMatchFound: handleMatchFound,
    onStatusChange: handleStatusChange,
    onSearchError: handleSearchError,
  });

  useEffect(() => {
    return () => {
      if (status === "searching") {
        stopSearch(false);
      }
    };
  }, [stopSearch, status]);

  const handleFindChat = useCallback(() => {
    if (!user || !profile || !profile.mbti_type) {
      toast.error(
        "Please ensure your profile is complete (especially MBTI type)."
      );
      return;
    }
    startFindingChatTransition(() => {
      startSearch();
    });
  }, [user, profile, startSearch, startFindingChatTransition]);

  const handleCancelSearch = useCallback(() => {
    startCancellingSearchTransition(async () => {
      await stopSearch(true);
    });
  }, [stopSearch, startCancellingSearchTransition]);

  if (isLoadingProfile) {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center pt-10 md:pt-16">
        <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
        <p className="mt-4 text-gray-600">Loading your profile...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 flex flex-col items-center justify-center pt-10 md:pt-16">
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-center">
        Find a Chat Partner
      </h1>

      {profile && profile.mbti_type && (
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

      {!profile?.mbti_type && !isLoadingProfile && (
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

      {status === "idle" && (
        <Button
          onClick={handleFindChat}
          disabled={!profile || !profile.mbti_type || isFindingChat}
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
