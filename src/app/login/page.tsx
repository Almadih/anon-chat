"use client";

import { useEffect, useState } from "react"; // Import useState
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner"; // Import toast
import { MessageCircle } from "lucide-react"; // Import Loader2
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Import Card components
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false); // Add loading state

  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        // Already logged in, redirect to dashboard or home
        router.replace("/profile"); // change to your desired route
      }
    };

    checkUser();
  }, [supabase, router]);

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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-6">
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            AnonChat
          </span>
        </Link>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md">
        <Card className="shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Welcome Back
            </CardTitle>
            <p className="text-gray-600 mt-2">
              Sign in to continue your personality journey
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Google Sign In */}
            <Button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full h-12 bg-white border border-gray-300 text-gray-700 cursor-pointer hover:bg-accent-foreground hover:text-black hover:border-gray-400 transition-all duration-200"
              variant="outline"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-3" />
              ) : (
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              Continue with Google
            </Button>

            {/* Privacy Notice */}
            <div className="text-center pt-2">
              <p className="text-xs text-gray-500">
                By signing in, you agree to our{" "}
                <Link href="/terms" className="text-purple-600 hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="text-purple-600 hover:underline"
                >
                  Privacy Policy
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Additional Info */}
        <div className="mt-8 text-center">
          <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <h3 className="font-semibold text-gray-900 mb-2">
              🔒 Your Privacy Matters
            </h3>
            <p className="text-sm text-gray-600">
              We use secure authentication and never store your personal
              conversations. Your anonymity is guaranteed.
            </p>
          </div>
        </div>
      </div>

      {/* Background Decoration */}
      <div className="absolute top-20 left-10 w-20 h-20 bg-purple-200 rounded-full opacity-20 animate-pulse"></div>
      <div className="absolute bottom-20 right-10 w-32 h-32 bg-pink-200 rounded-full opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute top-1/2 left-5 w-16 h-16 bg-purple-300 rounded-full opacity-10 animate-bounce delay-500"></div>
    </div>
  );
}
