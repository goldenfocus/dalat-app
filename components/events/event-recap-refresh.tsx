"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh pending recaps while keeping the story and labels server rendered. */
export function EventRecapRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
