"use client";

import { Share2 } from "lucide-react";
import { LikeButton } from "@/components/moments/like-button";
import { triggerHaptic } from "@/lib/haptics";

interface MomentEngagementBarProps {
  momentId: string;
  eventTitle: string;
  liked?: boolean;
  likeCount?: number;
}

/**
 * Right-side engagement bar (TikTok-style).
 * Contains like button and share action.
 */
export function MomentEngagementBar({
  momentId,
  eventTitle,
  liked = false,
  likeCount = 0,
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
    <div className="flex flex-col items-center gap-4">
      {/* Like button - reusing existing component */}
      <div className="flex flex-col items-center">
        <LikeButton
          momentId={momentId}
          initialLiked={liked}
          initialCount={likeCount}
          size="md"
        />
      </div>

      {/* Share button */}
      <button
        onClick={handleShare}
        className="flex flex-col items-center gap-1 p-2 text-white/80 hover:text-white transition-colors active:scale-95"
        aria-label="Share"
      >
        <Share2 className="w-5 h-5" />
      </button>
    </div>
  );
}
