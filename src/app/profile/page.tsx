import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "./profile-form";
import { ProfileStatusHandler } from "./profile-status-handler";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"; // Import Card components

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  // Fetch profile data
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("mbti_type, interested_mbti_types, public_key") // Added public_key
    .eq("id", user.id)
    .single(); // Use .single() as each user should have exactly one profile

  if (profileError && profileError.code !== "PGRST116") {
    // PGRST116 = 'Row not found' which is okay initially
    console.error("Error fetching profile:", profileError.message);
    // Optional: Redirect to an error page or show a message
  }

  return (
    // Adjusted vertical padding for mobile
    <div className="container mx-auto py-4 md:py-8 max-w-lg">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>
            View your current profile information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>
            <span className="font-semibold text-gray-600 dark:text-gray-400">
              Email:
            </span>{" "}
            {user.email}
          </p>
          <p>
            <span className="font-semibold text-gray-600 dark:text-gray-400">
              Your MBTI Type:
            </span>{" "}
            {profile?.mbti_type || (
              <span className="text-gray-500 italic">Not set</span>
            )}
          </p>
          <p>
            <span className="font-semibold text-gray-600 dark:text-gray-400">
              Interested Types:
            </span>{" "}
            {profile?.interested_mbti_types &&
            profile.interested_mbti_types.length > 0 ? (
              profile.interested_mbti_types.join(", ")
            ) : (
              <span className="text-gray-500 italic">
                Not set / Open to all
              </span>
            )}
          </p>
          <p>
            <span className="font-semibold text-gray-600 dark:text-gray-400">
              Encryption Status:
            </span>{" "}
            {profile?.public_key ? (
              <span className="text-green-600">Public key stored</span>
            ) : (
              <span className="text-orange-500 italic">
                No public key set up
              </span>
            )}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Update Your Profile</CardTitle>
          <CardDescription>
            Set your MBTI type and preferences for matching.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Pass fetched profile data (or empty object) as initialData */}
          <ProfileForm initialData={profile ?? undefined} />
        </CardContent>
      </Card>
      {/* Add Suspense wrapper for the client component using searchParams */}
      <Suspense fallback={null}>
        <ProfileStatusHandler />
      </Suspense>
    </div>
  );
}
