import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link"; // Import Link for navigation
import { MessageSquareText, User, LogOut } from "lucide-react"; // Import icons

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser(); // No need to handle error here, just check if user exists

  return (
    // Adjusted padding for mobile
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-black text-gray-800 dark:text-gray-200 p-4 sm:p-6">
      <div className="text-center max-w-2xl w-full">
        {user ? (
          // Logged-in View - Adjusted padding
          <div className="bg-white dark:bg-gray-800 shadow-xl rounded-lg p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
            {/* Adjusted heading size for mobile */}
            <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-blue-600 dark:text-blue-400">
              Welcome back, {user.email}!
            </h1>
            <p className="text-lg mb-8 text-gray-600 dark:text-gray-400">
              Ready to connect with someone new based on your personality?
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
              <Button
                asChild
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Link href="/find-chat">
                  <MessageSquareText className="mr-2 h-5 w-5" /> Find a Chat
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/profile">
                  <User className="mr-2 h-5 w-5" /> View Profile
                </Link>
              </Button>
            </div>
            <form action={signOut}>
              <Button
                variant="ghost"
                type="submit"
                className="text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
              >
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </Button>
            </form>
          </div>
        ) : (
          // Logged-out View (Public Landing Page) - Adjusted padding and text sizes
          <div className="bg-white dark:bg-gray-800 shadow-xl rounded-lg p-6 sm:p-10 border border-gray-200 dark:border-gray-700">
            {/* Adjusted heading size for mobile */}
            <h1 className="text-4xl sm:text-5xl font-extrabold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
              MBTI Anonymous Chat
            </h1>
            {/* Adjusted text size for mobile */}
            <p className="text-lg sm:text-xl mb-8 sm:mb-10 text-gray-600 dark:text-gray-400">
              Connect anonymously with others based on your Myers-Briggs Type
              Indicator. Discover meaningful conversations.
            </p>
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg transform hover:scale-105 transition-transform duration-300"
            >
              <Link href="/login">Get Started / Login</Link>
            </Button>
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-500">
              Find your match and start chatting today!
            </p>
          </div>
        )}
      </div>
      {/* Removed page-specific footer to rely on global footer from layout.tsx */}
    </div>
  );
}
