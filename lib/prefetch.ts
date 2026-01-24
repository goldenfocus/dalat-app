"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys, STALE_TIMES } from "@/lib/hooks/use-supabase-query";
import type { Event, EventCounts } from "@/lib/types";

/**
 * Hook providing prefetch utilities for proactive data loading.
 * Use on hover/touch for instant navigation experiences.
 * 
 * Safe to use during SSG - returns no-op functions if QueryClient isn't available.
 */
export function usePrefetch() {
  // useQueryClient throws if no QueryClient is set (e.g., during SSG before lazy load)
  // We catch this and return no-op functions for SSG safety
  let queryClient: ReturnType<typeof useQueryClient> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    queryClient = useQueryClient();
  } catch {
    // QueryClient not available (SSG or lazy load not complete)
    // Return no-op functions
    return {
      prefetchEvent: async () => {},
      prefetchEventCounts: async () => {},
      prefetchTranslations: async () => {},
    };
  }

  const supabase = createClient();

  /**
   * Prefetch event detail data on hover.
   * Makes navigation to event pages feel instant.
   */
  const prefetchEvent = async (slug: string) => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.events.detail(slug),
      queryFn: async () => {
        const { data, error } = await supabase
          .from("events")
          .select(
            "*, profiles(*), organizers(*), event_series(slug, title, rrule)"
          )
          .eq("slug", slug)
          .single();

        if (error) throw error;
        return data as Event;
      },
      staleTime: STALE_TIMES.events,
    });
  };

  /**
   * Prefetch event RSVP counts.
   * Useful for showing accurate counts immediately on page load.
   */
  const prefetchEventCounts = async (eventId: string) => {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.events.counts(eventId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from("rsvps")
          .select("status, plus_ones")
          .eq("event_id", eventId);

        if (error) throw error;

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
      staleTime: STALE_TIMES.eventCounts,
    });
  };

  /**
   * Prefetch translations for a batch of content.
   * Use when rendering lists to avoid translation flicker.
   */
  const prefetchTranslations = async (
    contentType: string,
    contentIds: string[],
    locale: string
  ) => {
    if (contentIds.length === 0) return;

    await queryClient.prefetchQuery({
      queryKey: queryKeys.translations.batch(contentType, contentIds, locale),
      queryFn: async () => {
        const { data } = await supabase
          .from("content_translations")
          .select("content_id, field_name, translated_text")
          .eq("content_type", contentType)
          .in("content_id", contentIds)
          .eq("target_locale", locale);

        return data ?? [];
      },
      staleTime: STALE_TIMES.translations,
    });
  };

  return {
    prefetchEvent,
    prefetchEventCounts,
    prefetchTranslations,
  };
}

/**
 * Utility to prefetch data during server-side rendering.
 * Call this in page components to hydrate the query cache.
 */
export function getServerPrefetchedData<T>(
  queryKey: readonly unknown[],
  data: T
) {
  return {
    queryKey,
    data,
    dataUpdatedAt: Date.now(),
  };
}
