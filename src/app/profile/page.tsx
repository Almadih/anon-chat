import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { User, Mail, Brain, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import KeyPairs from "./key-pairs";
import { Suspense } from "react";
import Preferences from "./preferences";
import AppHeader from "@/components/layout/header";

export default async function Page() {
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
    .select("*") // Added public_key
    .eq("id", user.id)
    .single()
    .overrideTypes<{ public_key: JsonWebKey }>(); // Use .single() as each user should have exactly one profile
  console.log(profile?.public_key);
  if (profileError && profileError.code !== "PGRST116") {
    // PGRST116 = 'Row not found' which is okay initially
    console.error("Error fetching profile:", profileError.message);
    // Optional: Redirect to an error page or show a message
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      {/* Header */}
      <AppHeader />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Profile Settings
          </h1>
          <p className="text-gray-600">
            Manage your account preferences and security settings
          </p>
        </div>

        <div className="grid gap-6">
          {/* User Basic Info Section */}
          <Card className="shadow-lg  bg-white/80 border-gray-100 border">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5 text-purple-600" />
                <span>Basic Information</span>
              </CardTitle>
              <CardDescription>
                Your account details and current MBTI profile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Mail className="w-4 h-4 text-gray-500" />
                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Email
                      </Label>
                      <p className="text-gray-900">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Brain className="w-4 h-4 text-purple-600" />
                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Your MBTI Type
                      </Label>
                      <div className="mt-1">
                        <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                          {profile?.mbti_type || "Not Set"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Heart className="w-4 h-4 text-pink-600 mt-1" />
                    <div>
                      <Label className="text-sm font-medium text-gray-700">
                        Interested in Types
                      </Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {profile?.interested_mbti_types?.length == 0 ? (
                          <Badge
                            variant="outline"
                            className="border-pink-200 text-pink-700"
                          >
                            Open To All
                          </Badge>
                        ) : null}
                        {profile?.interested_mbti_types?.map((type: string) => (
                          <Badge
                            key={type}
                            variant="outline"
                            className="border-pink-200 text-pink-700"
                          >
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="text-sm text-gray-500">
                      <p>Joined: {formatDate(user.created_at)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Suspense fallback={null}>
            <Preferences preferences={profile} />
            <KeyPairs publicKey={profile?.public_key} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
