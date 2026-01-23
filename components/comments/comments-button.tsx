"use client";

import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { CommentsSheet } from "./comments-sheet";
import { triggerHaptic } from "@/lib/haptics";
import type { CommentTargetType } from "@/lib/types";

interface CommentsButtonProps {
  /** Target type (event or moment) */
  targetType: CommentTargetType;
  /** Target ID */
  targetId: string;
  /** Event slug for navigation */
  eventSlug: string;
  /** Content title (event title or moment preview) */
  contentTitle: string;
  /** Content owner ID for moderation */
  contentOwnerId: string;
  /** Current user ID */
  currentUserId?: string;
  /** Initial comment count (optional, will fetch if not provided) */
  initialCount?: number;
  /** Custom button class */
  className?: string;
}

/**
 * Engagement bar button that opens the comments sheet.
 * Shows comment count badge.
 */
export function CommentsButton({
  targetType,
  targetId,
  eventSlug,
  contentTitle,
  contentOwnerId,
  currentUserId,
  initialCount,
  className,
}: CommentsButtonProps) {
  const t = useTranslations("comments");
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount ?? 0);
  const [countLoaded, setCountLoaded] = useState(initialCount !== undefined);

  // Fetch count on mount if not provided
  useEffect(() => {
    if (countLoaded) return;

    fetch(`/api/comments/count?targetType=${targetType}&targetId=${targetId}`)
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.total_count === "number") {
          setCount(data.total_count);
        }
      })
      .catch(console.error)
      .finally(() => setCountLoaded(true));
  }, [targetType, targetId, countLoaded]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerHaptic("selection");
    setOpen(true);
  };

  const buttonBaseClass =
    "flex flex-col items-center gap-1 p-3 rounded-full bg-black/40 backdrop-blur-sm text-white active:scale-95 active:bg-black/60 transition-all";

  return (
    <>
      <button
        onClick={handleClick}
        className={className || buttonBaseClass}
        aria-label={t("title")}
      >
        <MessageCircle className="w-6 h-6" />
        <span className="text-xs font-medium">
          {count > 0 ? count : t("title")}
        </span>
      </button>

      <CommentsSheet
        open={open}
        onOpenChange={setOpen}
        targetType={targetType}
        targetId={targetId}
        eventSlug={eventSlug}
        contentTitle={contentTitle}
        contentOwnerId={contentOwnerId}
        currentUserId={currentUserId}
        initialCount={count}
        onCountChange={setCount}
      />
    </>
  );
}
