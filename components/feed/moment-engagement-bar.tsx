"use client";

import { Share2, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { triggerHaptic } from "@/lib/haptics";
import { useShare } from "@/lib/hooks/use-share";
import { CommentsButton } from "@/components/comments";
import { ReactionBar } from "@/components/reactions/reaction-bar";
import type { ReactionCounts } from "@/lib/reactions";

interface MomentEngagementBarProps {
  momentId: string;
  eventTitle: string;
  eventSlug: string;
  momentOwnerId: string;
  currentUserId?: string;
  /** Whether this moment is a video */
  isVideo?: boolean;
  /** Current mute state (only relevant for videos) */
  isMuted?: boolean;
  /** Callback to toggle mute state */
  onMuteToggle?: () => void;
  /** Initial comment count */
  commentCount?: number;
  /** Pre-fetched reaction counts, batch-loaded by the feed */
  reactionCounts?: ReactionCounts;
  /** Whether the viewer is signed in (gates reacting) */
  isAuthenticated?: boolean;
}

/**
 * Right-side engagement bar (TikTok-style).
 * Vertically stacked actions at bottom-right.
 * Contains comments, share, and mute toggle (for videos).
 */
export function MomentEngagementBar({
  momentId,
  eventTitle,
  eventSlug,
  momentOwnerId,
  currentUserId,
  isVideo = false,
  isMuted = true,
  onMuteToggle,
  commentCount,
  reactionCounts,
  isAuthenticated,
}: MomentEngagementBarProps) {
  const t = useTranslations("moments");
  const { share: nativeShare } = useShare();

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    nativeShare({
      title: `Moment from ${eventTitle}`,
      url: `${window.location.origin}/moments/${momentId}`,
    });
  };

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerHaptic("selection");
    onMuteToggle?.();
  };

  const buttonBaseClass =
    "flex flex-col items-center gap-1 p-3 rounded-full bg-black/40 backdrop-blur-sm text-white active:scale-95 active:bg-black/60 transition-all";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Reactions */}
      <ReactionBar
        targetType="moment"
        targetId={momentId}
        isAuthenticated={isAuthenticated}
        counts={reactionCounts}
        variant="overlay"
        orientation="vertical"
        returnTo={`/moments/${momentId}`}
      />

      {/* Comments button */}
      <CommentsButton
        targetType="moment"
        targetId={momentId}
        eventSlug={eventSlug}
        contentTitle={eventTitle}
        contentOwnerId={momentOwnerId}
        currentUserId={currentUserId}
        initialCount={commentCount}
        className={buttonBaseClass}
      />

      {/* Share button */}
      <button
        onClick={handleShare}
        className={buttonBaseClass}
        aria-label={t("shareThisMoment")}
      >
        <Share2 className="w-6 h-6" />
        <span className="text-xs font-medium">{t("share")}</span>
      </button>

      {/* Mute toggle - only for videos */}
      {isVideo && onMuteToggle && (
        <button
          onClick={handleMuteToggle}
          className={buttonBaseClass}
          aria-label={isMuted ? t("unmuteVideo") : t("muteVideo")}
        >
          {isMuted ? (
            <VolumeX className="w-6 h-6" />
          ) : (
            <Volume2 className="w-6 h-6" />
          )}
          <span className="text-xs font-medium">{isMuted ? t("sound") : t("mute")}</span>
        </button>
      )}
    </div>
  );
}
