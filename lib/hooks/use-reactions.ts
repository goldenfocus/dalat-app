"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ReactionCounts, ReactionEmoji, ReactionTargetType } from "@/lib/reactions";

export const reactionKeys = {
  all: ["reactions"] as const,
  batch: (targetType: ReactionTargetType, ids: string[]) =>
    [...reactionKeys.all, targetType, [...ids].sort().join(",")] as const,
};

const REACTIONS_STALE_TIME = 30_000;

/**
 * Fetch reaction counts for a set of targets of one type.
 *
 * Client-side by design: reaction counts change far more often than the ISR
 * revalidate window (60-300s) on the pages that render moments, so baking them
 * into the cached payload would make a viewer's own tap appear to revert on the
 * next navigation.
 */
export function useReactions(targetType: ReactionTargetType, targetIds: string[]) {
  return useQuery({
    queryKey: reactionKeys.batch(targetType, targetIds),
    queryFn: async (): Promise<Map<string, ReactionCounts>> => {
      if (targetIds.length === 0) return new Map();

      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_reactions_batch", {
        p_target_type: targetType,
        p_target_ids: targetIds,
      });

      if (error) throw error;

      const byTarget = new Map<string, ReactionCounts>();
      for (const row of (data ?? []) as Array<{
        target_id: string;
        emoji: ReactionEmoji;
        count: number;
        reacted: boolean;
      }>) {
        const existing = byTarget.get(row.target_id) ?? {};
        existing[row.emoji] = { count: Number(row.count) || 0, reacted: row.reacted };
        byTarget.set(row.target_id, existing);
      }
      return byTarget;
    },
    staleTime: REACTIONS_STALE_TIME,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: targetIds.length > 0,
  });
}

/** Convenience wrapper for a single target. */
export function useTargetReactions(targetType: ReactionTargetType, targetId: string | undefined) {
  const ids = targetId ? [targetId] : [];
  const { data, isLoading } = useReactions(targetType, ids);
  return {
    counts: (targetId && data?.get(targetId)) || {},
    isLoading,
  };
}
