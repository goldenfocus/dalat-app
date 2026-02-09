"use client";

import { useState, useTransition } from "react";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { triggerHaptic } from "@/lib/haptics";
import { useTranslations } from "next-intl";
import type { FollowToggleResult } from "@/lib/types";

interface FollowButtonProps {
  targetUserId: string;
  initialIsFollowing: boolean;
  initialFollowerCount: number;
  onFollowerCountChange?: (count: number) => void;
  size?: "sm" | "default";
}

export function FollowButton({
  targetUserId,
  initialIsFollowing,
  initialFollowerCount,
  onFollowerCountChange,
  size = "default",
}: FollowButtonProps) {
  const t = useTranslations("profile");
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    triggerHaptic("selection");

    // Optimistic update
    const wasFollowing = isFollowing;
    const prevCount = followerCount;
    const newFollowing = !wasFollowing;
    const newCount = newFollowing ? prevCount + 1 : Math.max(0, prevCount - 1);

    setIsFollowing(newFollowing);
    setFollowerCount(newCount);
    onFollowerCountChange?.(newCount);

    startTransition(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("toggle_follow", {
        p_following_id: targetUserId,
      });

      if (error) {
        // Revert optimistic update
        setIsFollowing(wasFollowing);
        setFollowerCount(prevCount);
        onFollowerCountChange?.(prevCount);
        return;
      }

      const result = data as unknown as FollowToggleResult;
      setIsFollowing(result.is_following);
      setFollowerCount(result.follower_count);
      onFollowerCountChange?.(result.follower_count);
    });
  };

  return (
    <Button
      variant={isFollowing ? "outline" : "default"}
      size={size}
      onClick={handleToggle}
      disabled={isPending}
      className="min-w-[100px] gap-1.5"
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isFollowing ? (
        <UserCheck className="w-4 h-4" />
      ) : (
        <UserPlus className="w-4 h-4" />
      )}
      {isFollowing ? t("following") : t("follow")}
    </Button>
  );
}
