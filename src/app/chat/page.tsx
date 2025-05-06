import { redirect } from "next/navigation";

// This page is no longer used directly for chatting.
// Redirect users to the page where they can initiate a search.
export default function ChatRedirectPage() {
  redirect("/find-chat");
  // Note: redirect() must be called outside of JSX return
  // return null; // Or return some minimal JSX if needed before redirect completes
}
