"use client";

import { Share2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

interface MomentEngagementBarProps {
  momentId: string;
  eventTitle: string;
}

/**
 * Right-side engagement bar (TikTok-style).
 * Contains share action with prominent styling.
 */
export function MomentEngagementBar({
  momentId,
  eventTitle,
}: MomentEngagementBarProps) {
  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerHaptic("selection");

    const url = `${window.location.origin}/moments/${momentId}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Moment from ${eventTitle}`,
          url,
        });
      } catch {
        // User cancelled or share failed - ignore
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        triggerHaptic("medium");
        // TODO: Show toast notification
      } catch {
        // Clipboard access denied - ignore
      }
    }
  };

  return (
    <button
      onClick={handleShare}
      className="flex flex-col items-center gap-1 p-3 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-all active:scale-95"
      aria-label="Share this moment"
    >
      <Share2 className="w-6 h-6" />
      <span className="text-xs font-medium">Share</span>
    </button>
  );
}
