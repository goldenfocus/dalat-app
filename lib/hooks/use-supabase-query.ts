"use client";

import { useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { triggerHaptic } from "@/lib/haptics";
import type { MomentWithEvent, EventCounts } from "@/lib/types";

/**
 * Query key factory for consistent cache keys.
 * Use these everywhere to ensure cache hits/invalidation work correctly.
 */
export const queryKeys = {
  moments: {
    all: ["moments"] as const,
    feed: (filters: { contentTypes: string[] }) =>
      [...queryKeys.moments.all, "feed", filters] as const,
    event: (eventId: string) =>
      [...queryKeys.moments.all, "event", eventId] as const,
    user: (userId: string) =>
      [...queryKeys.moments.all, "user", userId] as const,
  },
  events: {
    all: ["events"] as const,
    lifecycle: (lifecycle: string) =>
      [...queryKeys.events.all, "lifecycle", lifecycle] as const,
    detail: (slug: string) =>
      [...queryKeys.events.all, "detail", slug] as const,
    counts: (eventId: string) =>
      [...queryKeys.events.all, "counts", eventId] as const,
  },
  translations: {
    all: ["translations"] as const,
    batch: (contentType: string, ids: string[], locale: string) =>
      [
        ...queryKeys.translations.all,
        contentType,
        ids.sort().join(","),
        locale,
      ] as const,
  },
} as const;

/**
 * Stale time configurations (in milliseconds).
 * Data is considered "fresh" for this duration.
 */
export const STALE_TIMES = {
  moments: 30_000, // 30 seconds - moments are dynamic
  events: 60_000, // 1 minute - events change less frequently
  eventCounts: 30_000, // 30 seconds - RSVP counts are dynamic
  translations: 300_000, // 5 minutes - translations rarely change
  profile: 120_000, // 2 minutes - profiles change occasionally
} as const;

/**
 * Infinite scroll hook for moments feed.
 * Handles pagination with cursor-based loading.
 */
export function useMomentsFeed(
  contentTypes: string[] = ["photo", "video"],
  initialData?: MomentWithEvent[]
) {
  const supabase = createClient();

  return useInfiniteQuery({
    queryKey: queryKeys.moments.feed({ contentTypes }),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await supabase.rpc("get_feed_moments", {
        p_limit: 10,
        p_offset: pageParam,
        p_content_types: contentTypes,
      });

      if (error) throw error;
      return (data ?? []) as MomentWithEvent[];
    },
    initialData: initialData
      ? {
          pages: [initialData],
          pageParams: [0],
        }
      : undefined,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // If we got fewer items than requested, there are no more pages
      if (lastPage.length < 10) return undefined;
      return allPages.flat().length;
    },
    staleTime: STALE_TIMES.moments,
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
}

/**
 * Hook for event counts with optional real-time updates.
 */
export function useEventCounts(eventId: string, initialData?: EventCounts) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.events.counts(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rsvps")
        .select("status, plus_ones")
        .eq("event_id", eventId);

      if (error) throw error;

      // Aggregate counts
      const counts: EventCounts = {
        event_id: eventId,
        going_count: 0,
        going_spots: 0,
        waitlist_count: 0,
        interested_count: 0,
      };

      for (const rsvp of data || []) {
        if (rsvp.status === "going") {
          counts.going_count++;
          counts.going_spots += 1 + (rsvp.plus_ones || 0);
        } else if (rsvp.status === "waitlist") {
          counts.waitlist_count++;
        } else if (rsvp.status === "interested") {
          counts.interested_count++;
        }
      }

      return counts;
    },
    initialData,
    staleTime: STALE_TIMES.eventCounts,
  });

  // Subscribe to real-time RSVP changes
  useEffect(() => {
    const channel = supabase
      .channel(`rsvps:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rsvps",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // Invalidate cache to trigger refetch
          queryClient.invalidateQueries({
            queryKey: queryKeys.events.counts(eventId),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, queryClient, supabase]);

  return query;
}

/**
 * Hook for RSVP mutations with optimistic updates.
 */
export function useRsvpMutation(eventId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      action,
      plusOnes,
    }: {
      action: "going" | "interested" | "cancel";
      plusOnes?: number;
    }) => {
      const rpcName =
        action === "cancel"
          ? "cancel_rsvp"
          : action === "interested"
            ? "mark_interested"
            : "rsvp_event";

      const { data, error } = await supabase.rpc(rpcName, {
        p_event_id: eventId,
        ...(plusOnes !== undefined && { p_plus_ones: plusOnes }),
      });

      if (error) throw error;
      return data;
    },
    onMutate: async ({ action, plusOnes = 0 }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.events.counts(eventId),
      });

      // Snapshot previous value
      const previousCounts = queryClient.getQueryData<EventCounts>(
        queryKeys.events.counts(eventId)
      );

      // Optimistically update
      queryClient.setQueryData<EventCounts>(
        queryKeys.events.counts(eventId),
        (old) => {
          if (!old) return old;

          if (action === "going") {
            return {
              ...old,
              going_count: old.going_count + 1,
              going_spots: old.going_spots + 1 + plusOnes,
            };
          }
          if (action === "interested") {
            return {
              ...old,
              interested_count: old.interested_count + 1,
            };
          }
          if (action === "cancel") {
            return {
              ...old,
              going_count: Math.max(0, old.going_count - 1),
              going_spots: Math.max(0, old.going_spots - 1 - plusOnes),
            };
          }
          return old;
        }
      );

      triggerHaptic("selection");
      return { previousCounts };
    },
    onError: (err, _, context) => {
      // Rollback on error
      if (context?.previousCounts) {
        queryClient.setQueryData(
          queryKeys.events.counts(eventId),
          context.previousCounts
        );
      }
      triggerHaptic("error");
    },
    onSuccess: () => {
      triggerHaptic("success");
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.events.counts(eventId),
      });
    },
  });
}

/**
 * Hook for fetching event detail with caching.
 */
export function useEventDetail(slug: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.events.detail(slug),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, profiles(*), organizers(*), event_series(slug, title, rrule)")
        .eq("slug", slug)
        .single();

      if (error) throw error;
      return data;
    },
    staleTime: STALE_TIMES.events,
  });
}
