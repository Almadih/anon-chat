import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Error exchanging code for session:", error.message);
      // Redirect to an error page or show an error message
      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=Authentication failed`
      );
    }
  } else {
    console.error("No code found in callback URL");
    // Redirect to an error page or show an error message
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=Authentication callback error`
    );
  }

  // URL to redirect to after successful sign in - Changed to /find-chat
  return NextResponse.redirect(`${requestUrl.origin}/profile`);
}
