"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function ToastHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const nextSearchParams = new URLSearchParams(searchParams.toString());

  useEffect(() => {
    const successMessage = searchParams.get("success");
    const errorMessage = searchParams.get("error");

    if (successMessage) {
      toast.success(successMessage);
      nextSearchParams.delete("success");
      router.replace(`${pathname}?${nextSearchParams}`);
    } else if (errorMessage) {
      nextSearchParams.delete("error");
      toast.error(errorMessage);
      router.replace(`${pathname}?${nextSearchParams}`);
    }
  }, [searchParams]); // Re-run effect if searchParams change

  // This component doesn't render anything itself
  return null;
}
