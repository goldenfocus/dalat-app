"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface MomentLikeState {
  liked: boolean;
  count: number;
}

/**
 * Query key factory for moment like counts
 */
export const momentLikesKeys = {
  all: ["momentLikes"] as const,
  moments: (ids: string[]) =>
    [...momentLikesKeys.all, "moments", [...ids].sort().join(",")] as const,
};

/**
 * Stale time for like counts (30 seconds), matching comment counts.
 */
const MOMENT_LIKES_STALE_TIME = 30_000;

/**
 * Hook to fetch like counts + the current user's liked state for multiple moments.
 *
 * Deliberately client-side: like counts change far more often than the ISR
 * revalidate window on the pages that render moments, so server-rendering them
 * into a cached payload would show stale numbers (and make a user's own tap
 * appear to revert on the next navigation).
 *
 * Uses `get_moment_like_counts`, which resolves `liked` from auth.uid() server
 * side and returns false for anonymous viewers.
 *
 * @param momentIds - Moment IDs to fetch state for
 */
export function useMomentLikes(momentIds: string[]) {
  return useQuery({
    queryKey: momentLikesKeys.moments(momentIds),
    queryFn: async (): Promise<Map<string, MomentLikeState>> => {
      if (momentIds.length === 0) {
        return new Map();
      }

      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_moment_like_counts", {
        p_moment_ids: momentIds,
      });

      if (error) throw error;

      const states = new Map<string, MomentLikeState>();
      for (const row of (data ?? []) as Array<{
        moment_id: string;
        liked: boolean;
        count: number;
      }>) {
        states.set(row.moment_id, {
          liked: row.liked,
          count: Number(row.count) || 0,
        });
      }

      return states;
    },
    staleTime: MOMENT_LIKES_STALE_TIME,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: momentIds.length > 0,
  });
}
