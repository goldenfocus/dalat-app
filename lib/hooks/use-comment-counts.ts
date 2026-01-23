"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Query key factory for comment counts
 */
export const commentCountsKeys = {
  all: ["commentCounts"] as const,
  moments: (ids: string[]) =>
    [...commentCountsKeys.all, "moments", [...ids].sort().join(",")] as const,
};

/**
 * Stale time for comment counts (30 seconds)
 * Counts are relatively stable but should refresh periodically
 */
const COMMENT_COUNTS_STALE_TIME = 30_000;

/**
 * Hook to fetch comment counts for multiple moments.
 * Uses React Query for caching, deduplication, and stale-while-revalidate.
 *
 * Features:
 * - Stable query key (sorted IDs) prevents refetches when array order changes
 * - Automatic caching and deduplication
 * - Graceful error handling
 *
 * @param momentIds - Array of moment IDs to fetch counts for
 * @returns { counts, isLoading, error }
 *
 * @example
 * const { counts, isLoading } = useCommentCounts(momentIds);
 * // counts.get("moment-id") returns the total comment count
 */
export function useCommentCounts(momentIds: string[]) {
  return useQuery({
    queryKey: commentCountsKeys.moments(momentIds),
    queryFn: async (): Promise<Map<string, number>> => {
      if (momentIds.length === 0) {
        return new Map();
      }

      const response = await fetch("/api/comments/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "moment",
          targetIds: momentIds,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch comment counts: ${response.status}`);
      }

      const data = await response.json();

      // Convert object to Map
      const counts = new Map<string, number>();
      if (data.counts) {
        for (const [id, count] of Object.entries(data.counts)) {
          counts.set(id, count as number);
        }
      }

      return counts;
    },
    staleTime: COMMENT_COUNTS_STALE_TIME,
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    // Don't refetch on window focus for counts (they're not critical)
    refetchOnWindowFocus: false,
    // Enable query only if we have IDs
    enabled: momentIds.length > 0,
  });
}

/**
 * Helper hook that returns counts in a simpler format for components
 * that just need to check if a moment has comments.
 *
 * @param momentIds - Array of moment IDs
 * @returns Object with counts Map and loading state
 */
export function useMomentCommentCounts(momentIds: string[]) {
  const { data: counts, isLoading, error } = useCommentCounts(momentIds);

  return {
    counts: counts ?? new Map<string, number>(),
    isLoading,
    error,
  };
}
