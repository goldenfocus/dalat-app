"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/haptics";

interface BlogLikeButtonProps {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function BlogLikeButton({
  postId,
  initialLiked,
  initialCount,
}: BlogLikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    triggerHaptic("selection");

    // Optimistic update
    const wasLiked = liked;
    setLiked(!wasLiked);
    setCount((c) => (wasLiked ? c - 1 : c + 1));

    startTransition(async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("toggle_blog_post_like", {
          p_post_id: postId,
        });

        if (error) throw error;

        // Sync with server response
        setLiked(data.liked);
        setCount(data.count);
        triggerHaptic("medium");
      } catch (error) {
        // Rollback on error
        setLiked(wasLiked);
        setCount((c) => (wasLiked ? c + 1 : c - 1));
        console.error("Failed to toggle like:", error);
      }
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        "gap-2 transition-all active:scale-95",
        liked && "text-red-500"
      )}
    >
      <Heart
        className={cn(
          "w-5 h-5 transition-all",
          liked && "fill-current scale-110"
        )}
      />
      <span>{count}</span>
    </Button>
  );
}
