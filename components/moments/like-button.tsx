"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface LikeButtonProps {
  momentId: string;
  initialLiked: boolean;
  initialCount: number;
  size?: "sm" | "md";
}

export function LikeButton({
  momentId,
  initialLiked,
  initialCount,
  size = "md",
}: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation when inside a link
    e.stopPropagation();

    if (isLoading) return;

    triggerHaptic("selection");
    setIsLoading(true);

    // Optimistic update
    const wasLiked = liked;
    const prevCount = count;
    setLiked(!wasLiked);
    setCount(wasLiked ? prevCount - 1 : prevCount + 1);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("toggle_moment_like", {
      p_moment_id: momentId,
    });

    if (error) {
      // Revert on error
      console.error("Failed to toggle like:", error);
      setLiked(wasLiked);
      setCount(prevCount);
    } else if (data) {
      // Sync with server response
      const result = data as { liked: boolean; count: number };
      setLiked(result.liked);
      setCount(result.count);
      if (result.liked) {
        triggerHaptic("medium");
      }
    }

    setIsLoading(false);
  };

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const buttonPadding = size === "sm" ? "p-1.5" : "p-2";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={cn(
        "flex items-center gap-1 rounded-full transition-all active:scale-95",
        buttonPadding,
        liked
          ? "text-red-500"
          : "text-white/80 hover:text-white"
      )}
      aria-label={liked ? "Unlike" : "Like"}
    >
      <Heart
        className={cn(
          iconSize,
          "transition-transform",
          liked && "fill-current scale-110"
        )}
      />
      {count > 0 && (
        <span className={cn(textSize, "font-medium tabular-nums")}>
          {count}
        </span>
      )}
    </button>
  );
}
