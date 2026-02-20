import { unstable_cache } from "next/cache";
import { createStaticClient } from "@/lib/supabase/server";
import type {
  Event,
  EventWithSeriesData,
  EventCounts,
  ContentLocale,
  TranslationContentType,
} from "@/lib/types";

/**
 * Cache tags for granular invalidation.
 * Use these with revalidateTag() for on-demand revalidation.
 */
export const CACHE_TAGS = {
  events: "events",
  eventsLifecycle: (lifecycle: string) => `events-${lifecycle}`,
  event: (slug: string) => `event-${slug}`,
  eventCounts: (eventId: string) => `event-counts-${eventId}`,
  translations: "translations",
  translationsBatch: (type: string, locale: string) =>
    `translations-${type}-${locale}`,
  moments: "moments",
  momentsFeed: "moments-feed",
  blog: "blog",
  homepageConfig: "homepage-config",
} as const;

/**
 * Cached event listing by lifecycle stage.
 * Revalidates every 60 seconds.
 */
export const getCachedEventsByLifecycle = unstable_cache(
  async (
    lifecycle: "upcoming" | "happening" | "past",
    limit: number = 10  // Reduced from 20 for faster LCP
  ): Promise<EventWithSeriesData[]> => {
    try {
      // Use static client for ISR context (no cookies needed for public data)
      const supabase = createStaticClient();
      if (!supabase) {
        console.error("Failed to create Supabase client (missing env vars)");
        return [];
      }

      // Use deduplicated RPC - shows ONE entry per recurring series
      const { data, error } = await supabase.rpc("get_events_by_lifecycle_deduplicated", {
        p_lifecycle: lifecycle,
        p_limit: limit,
      });

      if (error) {
        console.error("Error fetching events by lifecycle:", error);
        return [];
      }

      // RPC returns series_slug, series_rrule, is_recurring directly
      return (data as EventWithSeriesData[]) || [];
    } catch (err) {
      console.error("Exception in getCachedEventsByLifecycle:", err);
      return [];
    }
  },
  ["events-by-lifecycle-v7"], // v7: cache bust for stale homepage data
  {
    revalidate: 60, // 1 minute
    tags: [CACHE_TAGS.events],
  }
);

/**
 * Cached events for "this week" view.
 * Revalidates every 5 minutes.
 */
export const getCachedEventsThisWeek = unstable_cache(
  async (): Promise<Event[]> => {
    const supabase = createStaticClient();
    if (!supabase) return [];

    const { data, error } = await supabase.rpc("get_events_this_week", {
      p_limit: 50,
    });

    if (error) {
      console.error("Error fetching events this week:", error);
      return [];
    }

    return (data as Event[]) || [];
  },
  ["events-this-week-v2"],
  {
    revalidate: 300, // 5 minutes
    tags: [CACHE_TAGS.events, CACHE_TAGS.eventsLifecycle("upcoming")],
  }
);

/**
 * Cached event detail by slug.
 * Revalidates every 5 minutes.
 */
export const getCachedEventBySlug = unstable_cache(
  async (slug: string): Promise<Event | null> => {
    const supabase = createStaticClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("events")
      .select("*, profiles(*), organizers(*), event_series(slug, title, rrule)")
      .eq("slug", slug)
      .single();

    if (error) {
      console.error("Error fetching event by slug:", error);
      return null;
    }

    return data as Event;
  },
  ["event-by-slug-v2"],
  {
    revalidate: 300, // 5 minutes
    tags: [CACHE_TAGS.events],
  }
);

/**
 * Cached translation batch fetching.
 * Revalidates every 5 minutes - translations rarely change.
 */
export const getCachedTranslationsBatch = unstable_cache(
  async (
    contentType: TranslationContentType,
    contentIds: string[],
    targetLocale: ContentLocale
  ): Promise<
    Record<string, { title?: string; description?: string; text_content?: string; content?: string }>
  > => {
    if (contentIds.length === 0) return {};

    const supabase = createStaticClient();
    if (!supabase) return {};

    const { data: translations } = await supabase
      .from("content_translations")
      .select("content_id, field_name, translated_text")
      .eq("content_type", contentType)
      .in("content_id", contentIds)
      .eq("target_locale", targetLocale)
      .in("field_name", ["title", "description", "text_content", "content"]);

    // Use plain Record instead of Map — Map doesn't survive JSON serialization
    // in unstable_cache (Map becomes {} on cache hit, breaking .get() calls)
    const result: Record<string, { title?: string; description?: string; text_content?: string; content?: string }> = {};

    if (translations) {
      for (const t of translations) {
        const existing = result[t.content_id] || {};
        if (t.field_name === "title") {
          existing.title = t.translated_text;
        } else if (t.field_name === "description") {
          existing.description = t.translated_text;
        } else if (t.field_name === "text_content") {
          existing.text_content = t.translated_text;
        } else if (t.field_name === "content") {
          existing.content = t.translated_text;
        }
        result[t.content_id] = existing;
      }
    }

    return result;
  },
  ["translations-batch"],
  {
    revalidate: 30, // 30 seconds - short TTL for faster translation updates
    tags: [CACHE_TAGS.translations],
  }
);

/**
 * Cached blog categories.
 * Revalidates every hour - categories rarely change.
 */
export const getCachedBlogCategories = unstable_cache(
  async () => {
    const supabase = createStaticClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("blog_categories")
      .select("*")
      .order("sort_order");

    if (error) {
      console.error("Failed to fetch blog categories:", error);
      return [];
    }

    return data ?? [];
  },
  ["blog-categories-v2"],
  {
    revalidate: 3600, // 1 hour
    tags: [CACHE_TAGS.blog],
  }
);

/**
 * Cached event counts (RSVP counts).
 * Short revalidation since these change frequently.
 */
export const getCachedEventCounts = unstable_cache(
  async (eventId: string): Promise<EventCounts | null> => {
    const supabase = createStaticClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("rsvps")
      .select("status, plus_ones")
      .eq("event_id", eventId);

    if (error) {
      console.error("Error fetching event counts:", error);
      return null;
    }

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
  ["event-counts"],
  {
    revalidate: 30, // 30 seconds - counts change frequently
    tags: [CACHE_TAGS.events],
  }
);

/**
 * Cached batch event counts for multiple events.
 * Uses database-side aggregation via RPC for efficiency.
 *
 * NOTE: This is a factory function that creates a cache entry per unique set of eventIds.
 * The eventIds are sorted and included in the cache key to ensure correct cache hits.
 */
export function getCachedEventCountsBatch(eventIds: string[]): Promise<Record<string, EventCounts>> {
  if (eventIds.length === 0) return Promise.resolve({});

  // Sort eventIds for consistent cache keys regardless of input order
  const sortedIds = [...eventIds].sort();

  return unstable_cache(
    async (): Promise<Record<string, EventCounts>> => {
      try {
        // Use static client for ISR context (no cookies needed for public data)
        const supabase = createStaticClient();
        if (!supabase) {
          console.error("Failed to create Supabase client (missing env vars)");
          return {};
        }

        // Use database-side aggregation via RPC (much faster than fetching all RSVPs)
        const { data, error } = await supabase.rpc("get_event_counts_batch", {
          p_event_ids: sortedIds,
        });

        if (error) {
          console.error("Error fetching batch event counts:", error);
          return {};
        }

        // Convert array result to Record keyed by event_id
        const counts: Record<string, EventCounts> = {};
        for (const row of data || []) {
          counts[row.event_id] = {
            event_id: row.event_id,
            going_count: row.going_count,
            going_spots: row.going_spots,
            waitlist_count: row.waitlist_count,
            interested_count: row.interested_count,
          };
        }

        // Initialize missing events with zero counts (events with no RSVPs)
        for (const eventId of sortedIds) {
          if (!counts[eventId]) {
            counts[eventId] = {
              event_id: eventId,
              going_count: 0,
              going_spots: 0,
              waitlist_count: 0,
              interested_count: 0,
            };
          }
        }

        return counts;
      } catch (err) {
        console.error("Exception in getCachedEventCountsBatch:", err);
        return {};
      }
    },
    ["event-counts-batch-v2", sortedIds.join(",")],
    {
      revalidate: 30, // 30 seconds
      tags: [CACHE_TAGS.events],
    }
  )();
}

/**
 * Cached lifecycle counts (for tab display).
 * Revalidates every minute.
 */
export const getCachedLifecycleCounts = unstable_cache(
  async (): Promise<{ upcoming: number; happening: number; past: number }> => {
    const supabase = createStaticClient();
    if (!supabase) return { upcoming: 0, happening: 0, past: 0 };

    // Get count of happening events (just need to know if > 0)
    const { data: happeningEvents } = await supabase.rpc(
      "get_events_by_lifecycle",
      {
        p_lifecycle: "happening",
        p_limit: 1,
      }
    );

    return {
      upcoming: 0, // Not needed for hiding logic
      happening: happeningEvents?.length ?? 0,
      past: 0, // Not needed for hiding logic
    };
  },
  ["lifecycle-counts-v1"],
  {
    revalidate: 60, // 1 minute
    tags: [CACHE_TAGS.events],
  }
);

/**
 * Homepage config type.
 */
export interface HomepageConfig {
  id: string;
  hero_image_url: string | null;
  hero_focal_point: string | null;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Cached homepage configuration.
 * Revalidates every 60 seconds - changes are infrequent.
 */
export const getCachedHomepageConfig = unstable_cache(
  async (): Promise<HomepageConfig | null> => {
    const supabase = createStaticClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("homepage_config")
      .select("*")
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching homepage config:", error);
      return null;
    }

    return data as HomepageConfig;
  },
  ["homepage-config-v1"],
  {
    revalidate: 60, // 1 minute
    tags: [CACHE_TAGS.homepageConfig],
  }
);
