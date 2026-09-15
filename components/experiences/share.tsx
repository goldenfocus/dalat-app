"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function ShareExperience({
  url,
  label,
  copied,
}: {
  url: string;
  label: string;
  copied: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ url });
          else {
            await navigator.clipboard.writeText(url);
            setDone(true);
          }
        } catch {
          /* Cancellation leaves the permanent link visible. */
        }
      }}
    >
      {done ? copied : label}
    </Button>
  );
}
