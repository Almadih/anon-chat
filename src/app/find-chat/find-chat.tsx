"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Brain,
  Heart,
  Search,
  Users,
  Zap,
  CheckCircle,
  Clock,
  Sparkles,
  TriangleAlert,
  X,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { FindChatStatus, Profile, QueueEntry } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useMatchmaking } from "@/hooks/useMatchmaking";
import { useHasEncryptionKeys } from "@/hooks/useEncryption";
import AppHeader from "@/components/layout/header";

const matchingSteps = [
  { id: "searching", label: "Searching for users", icon: Search },
  { id: "found", label: "Match found!", icon: CheckCircle },
];

type Props = {
  profile: Profile;
  user: User;
  queue: QueueEntry | null;
};

export default function FindChat({ profile, user, queue }: Props) {
  const [status, setStatus] = useState<FindChatStatus>(
    queue ? "searching" : "idle"
  );
  const supabase = createClient();
  const router = useRouter();
  const [isIncompleteProfile, setIsIncompleteProfile] = useState(false);
  const [isFindingChat, startFindingChatTransition] = useTransition();
  const [isCancellingSearch, startCancellingSearchTransition] = useTransition();
  const [currentStep, setCurrentStep] = useState(0);
  const [compatibleUsers, setCompatibleUsers] = useState(0);
  const hasKeys = useHasEncryptionKeys(profile);

  useEffect(() => {
    if (queue) {
      handleFindChat();
    }
  }, [queue]);

  useEffect(() => {
    const channel = supabase.channel("online-users", {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat();
        setCompatibleUsers(users.length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const handleMatchFound = useCallback(
    (chatId: string) => {
      toast.success("Match found!");
      setTimeout(() => {
        setStatus("matched");
        router.push(`/chat/${chatId}`);
      }, 500);
    },
    [router]
  );

  useEffect(() => {
    if (!profile.mbti_type) {
      setIsIncompleteProfile(true);
    }
  }, [profile]);

  const handleStatusChange = useCallback((newStatus: FindChatStatus) => {
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
    if (!profile.mbti_type) {
      toast.error(
        "Please ensure your profile is complete (especially MBTI type)."
      );
      setIsIncompleteProfile(true);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      {/* Header */}
      <AppHeader />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Find Your Perfect Chat Partner
          </h1>
          <p className="text-gray-600">
            Connect with compatible personalities for meaningful conversations
          </p>
        </div>
        {isIncompleteProfile ? (
          <div className="mb-3">
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                <p>
                  Your profile is incomplete. Please set your MBTI type on your{" "}
                  <Link href="/profile">
                    <span className="underline">Profile page</span>
                  </Link>{" "}
                  to find a chat.
                </p>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {!hasKeys ? (
          <div className="mb-3">
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                <p>
                  Your profile is incomplete. Please regenerate you encryption
                  keys in your{" "}
                  <Link href="/profile">
                    <span className="underline">Profile page</span>
                  </Link>{" "}
                  to find a chat.
                </p>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="grid gap-6">
          {/* Current Preferences */}
          <Card className="shadow-lg  bg-white/80 border-gray-100 border">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="w-5 h-5 text-purple-600" />
                <span>Your Matching Preferences</span>
              </CardTitle>
              <CardDescription>
                Based on your personality profile and interests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-purple-200 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Brain className="w-8 h-8 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Your Type
                  </h3>
                  <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-lg px-4 py-1">
                    {profile.mbti_type}
                  </Badge>
                </div>

                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-pink-100 to-pink-200 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Heart className="w-8 h-8 text-pink-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Interested In
                  </h3>
                  {profile.interested_mbti_types?.length! > 0 ? (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {profile.interested_mbti_types?.map((type) => (
                        <Badge
                          key={type}
                          variant="outline"
                          className="border-pink-200 text-pink-700"
                        >
                          {type}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-pink-200 text-pink-700"
                    >
                      All Types
                    </Badge>
                  )}
                </div>

                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-green-200 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Users className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Online Users
                  </h3>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-green-600">
                      {compatibleUsers}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Matching Interface */}
          <Card className="shadow-lg  bg-white/80 border-gray-100 border">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-yellow-600" />
                <span>Smart Matching</span>
              </CardTitle>
              <CardDescription>
                Our algorithm will finds compatible users based on their
                profiles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Matching Process */}
              {status === "idle" && (
                <div className="text-center space-y-4">
                  <div className="w-24 h-24 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center mx-auto">
                    <Search className="w-12 h-12 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      Ready to Find Your Match?
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Click below to start searching for compatible
                      personalities
                    </p>
                    <Button
                      onClick={handleFindChat}
                      disabled={isIncompleteProfile || !hasKeys}
                      size="lg"
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg px-8 py-3"
                    >
                      <Search className="w-5 h-5 mr-2" />
                      Start Matching
                    </Button>
                  </div>
                </div>
              )}

              {status == "error" && (
                <div className="text-center space-y-4">
                  <div className="w-24 h-24 bg-gradient-to-br from-red-600 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-12 h-12 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      An error occurred. Please try again.
                    </h3>
                    <p className="text-gray-600 mb-6">
                      We were unable to find a compatible chat partner. Please
                      try again later.
                    </p>
                    <Button
                      onClick={handleFindChat}
                      size="lg"
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg px-8 py-3"
                    >
                      <Search className="w-5 h-5 mr-2" />
                      Try Again
                    </Button>
                  </div>
                </div>
              )}

              {/* Searching Process */}
              {status == "searching" && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                      {matchingSteps[currentStep] &&
                        (() => {
                          const Icon = matchingSteps[currentStep]?.icon;
                          return Icon ? (
                            <Icon className="w-12 h-12 text-white" />
                          ) : null;
                        })()}
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {matchingSteps[currentStep]?.label}
                    </h3>
                    <p className="text-gray-600">
                      Please wait while we find your perfect match...
                    </p>
                    <Button
                      variant="destructive"
                      className="mt-2 px-8 py-3"
                      onClick={handleCancelSearch}
                    >
                      <X className="w-4 h-4" />
                      Cancel Search
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {matchingSteps.map((step, index) => (
                      <div
                        key={step.id}
                        className={`text-center p-3 rounded-lg transition-all ${
                          index <= currentStep
                            ? "bg-gradient-to-br from-purple-100 to-pink-100 text-purple-700"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {(() => {
                          const StepIcon = step.icon;
                          return <StepIcon className="w-5 h-5 mx-auto mb-1" />;
                        })()}
                        <p className="text-xs font-medium">{step.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Match Found */}
              {status === "matched" && (
                <div className="text-center space-y-6">
                  <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <CheckCircle className="w-12 h-12 text-white" />
                  </div>

                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      Perfect Match Found! 🎉
                    </h3>
                    <p className="text-gray-600">
                      We found someone who's perfect for you
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="shadow-lg  bg-white/80 border-gray-100 border">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-yellow-600" />
                <span>Matching Tips</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Best Times:</strong> Most users are online between
                    7-10 PM in your timezone.
                  </AlertDescription>
                </Alert>
                <Alert>
                  <Heart className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Compatibility:</strong> Matches above 80% typically
                    lead to great conversations.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
