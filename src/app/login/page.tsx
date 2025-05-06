"use client";

import { useState } from "react"; // Import useState
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner"; // Import toast
import { Loader2 } from "lucide-react"; // Import Loader2
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"; // Import Card components

export default function LoginPage() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false); // Add loading state

  const handleLogin = async () => {
    setIsLoading(true); // Set loading true
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Optional: Redirect URL after successful login
        redirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error("Error logging in:", error.message);
      // Show user-friendly error message using toast
      toast.error("Login failed: " + error.message);
      setIsLoading(false); // Set loading false on error
    }
    // No need to set isLoading false on success, as page redirects
  };

  return (
    // Added background gradient for consistency
    <div className="flex justify-center items-center min-h-screen p-4 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-black">
      <Card className="w-full max-w-sm bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700">
        {" "}
        {/* Added background/border for card */}
        <CardHeader className="text-center space-y-1">
          {/* Add spacing */}
          <CardTitle className="text-2xl">MBTI Random Chat</CardTitle>{" "}
          {/* Slightly larger title */}
          <CardDescription>Sign in to find a chat partner.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          {/* Add loading state to button */}
          <Button
            onClick={handleLogin}
            className="w-full"
            disabled={isLoading} // Disable button when loading
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> // Show loader
            ) : null}
            {isLoading ? "Logging in..." : "Login with Google"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
