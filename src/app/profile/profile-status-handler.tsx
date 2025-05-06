"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function ProfileStatusHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const successMessage = searchParams.get("success");
    const errorMessage = searchParams.get("error");

    if (successMessage) {
      toast.success(successMessage);
      // Optional: Clean the URL query params after showing the toast
      // window.history.replaceState(null, '', '/profile');
    } else if (errorMessage) {
      toast.error(errorMessage);
      // Optional: Clean the URL query params
      // window.history.replaceState(null, '', '/profile');
    }
  }, [searchParams]); // Re-run effect if searchParams change

  // This component doesn't render anything itself
  return null;
}
