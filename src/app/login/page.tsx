import { createClient } from "@/lib/supabase/server";
import LoginComponent from "./login-component";
import { redirect } from "next/navigation";

export const metadata = {
  title: "AnonChat - Login",
};

export default async function Page() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/profile");
  }

  return <LoginComponent />;
}
