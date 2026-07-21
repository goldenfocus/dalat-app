"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { triggerHaptic } from "@/lib/haptics";

interface LikeButtonProps {
  momentId: string;
  /** Whether the current user has already liked this moment */
  initialLiked?: boolean;
  /** Initial like count */
  initialCount?: number;
  /** When false, tapping routes to sign-in instead of calling the RPC */
  isAuthenticated?: boolean;
  /** Custom button class */
  className?: string;
}

interface LikeToggleResult {
  ok: boolean;
  moment_id: string;
  liked: boolean;
  count: number;
}

/**
 * Heart/like button for a moment.
 *
 * Optimistically flips state, then reconciles with the count the RPC returns.
 * Mirrors the toggle pattern in components/profile/follow-button.tsx.
 */
export function LikeButton({
  momentId,
  initialLiked = false,
  initialCount = 0,
  isAuthenticated = false,
  className,
}: LikeButtonProps) {
  const t = useTranslations("moments");
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Signed-out visitors get sent to sign-in rather than a silent no-op —
    // toggle_moment_like raises not_authenticated for them.
    if (!isAuthenticated) {
      router.push(`/auth/login?next=${encodeURIComponent(`/moments/${momentId}`)}`);
      return;
    }

    triggerHaptic("selection");

    const prevLiked = liked;
    const prevCount = count;
    const nextLiked = !prevLiked;

    setLiked(nextLiked);
    setCount(nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1));

    startTransition(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("toggle_moment_like", {
        p_moment_id: momentId,
      });

      if (error) {
        console.error("toggle_moment_like failed:", error.message, error);
        setLiked(prevLiked);
        setCount(prevCount);
        triggerHaptic("error");
        return;
      }

      const result = data as unknown as LikeToggleResult;
      setLiked(result.liked);
      setCount(Number(result.count) || 0);
      triggerHaptic(result.liked ? "success" : "light");
    });
  };

  const buttonBaseClass =
    "flex flex-col items-center gap-1 p-3 rounded-full bg-black/40 backdrop-blur-sm text-white active:scale-95 active:bg-black/60 transition-all";

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={className || buttonBaseClass}
      aria-label={liked ? t("liked") : t("like")}
      aria-pressed={liked}
    >
      <Heart
        className={`w-6 h-6 transition-transform ${liked ? "fill-current text-rose-500" : ""}`}
      />
      <span className="text-xs font-medium">{count > 0 ? count : t("like")}</span>
    </button>
  );
}
