"use client";

import { useState, useEffect } from "react";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

interface ProfileData {
  mbti_type: string | null;
  interested_mbti_types: string[] | null;
}

interface UseUserProfileDataProps {
  supabase: SupabaseClient;
  router: AppRouterInstance; // Or NextRouter if using pages router
}

interface UseUserProfileDataResult {
  user: User | null;
  profile: ProfileData | null;
  isLoading: boolean;
  error: string | null;
}

export function useUserProfileData({
  supabase,
  router,
}: UseUserProfileDataProps): UseUserProfileDataResult {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchUserAndProfile = async () => {
      setIsLoading(true);
      setError(null);

      const {
        data: { user: currentUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (authError) {
        console.error("Auth error fetching user:", authError);
        toast.error("Authentication error. Please try again.");
        setError("Authentication error.");
        setIsLoading(false);
        router.push("/login"); // Should redirect even on auth error
        return;
      }

      if (!currentUser) {
        toast.error("You must be logged in to find a chat.");
        setError("User not authenticated.");
        setIsLoading(false);
        router.push("/login");
        return;
      }
      setUser(currentUser);

      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("mbti_type, interested_mbti_types")
        .eq("id", currentUser.id)
        .single();

      if (!isMounted) return;

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        // Don't toast an error here if it's just that the profile doesn't exist yet,
        // as that's a valid state before they set it up.
        // Only toast if it's an unexpected DB error.
        if (profileError.code !== "PGRST116") { // PGRST116: "Searched for a single row, but found no rows" or "found multiple rows"
            toast.error("Could not load your profile. Please try again.");
        }
        setError("Failed to load profile.");
        // Allow to proceed to profile page if mbti_type is missing
      }
      
      if (userProfile) {
        setProfile(userProfile);
        if (!userProfile.mbti_type) {
          toast.info("Please set your MBTI type on your profile page to find a chat.");
          setError("Profile incomplete."); // Specific error for this case
          router.push("/profile");
          // setIsLoading(false) will be handled after this potential redirect
        }
      } else {
        // This case means the profile row doesn't exist at all.
        toast.info("Please create your profile to find a chat.");
        setError("Profile not found.");
        router.push("/profile");
      }
      setIsLoading(false);
    };

    fetchUserAndProfile();

    return () => {
      isMounted = false;
    };
  }, [supabase, router]);

  return { user, profile, isLoading, error };
}
