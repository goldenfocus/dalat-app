"use client";

import { Share2 } from "lucide-react";
import { useShare } from "@/lib/hooks/use-share";

interface VenueShareButtonProps {
  name: string;
  shareText: string;
  url: string;
  label: string;
}

export function VenueShareButton({ name, shareText, url, label }: VenueShareButtonProps) {
  const { share, copied } = useShare();

  return (
    <button
      type="button"
      onClick={() =>
        share({
          title: `${name} — ĐàLạt.app`,
          text: shareText,
          url,
        })
      }
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-95 transition-all"
    >
      <Share2 className="w-4 h-4" />
      {copied ? "✓" : label}
    </button>
  );
}
