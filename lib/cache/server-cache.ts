import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
} as const;

/**
 * Cached event listing by lifecycle stage.
 * Revalidates every 60 seconds.
 */
export const getCachedEventsByLifecycle = unstable_cache(
  async (
    lifecycle: "upcoming" | "happening" | "past"
  ): Promise<EventWithSeriesData[]> => {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc(
      "get_events_by_lifecycle_deduplicated",
      {
        p_lifecycle: lifecycle,
        p_limit: 20,
      }
    );

    if (error) {
      console.error("Error fetching events by lifecycle:", error);
      return [];
    }

    return (data as EventWithSeriesData[]) || [];
  },
  ["events-by-lifecycle"],
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
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_events_this_week", {
      p_limit: 50,
    });

    if (error) {
      console.error("Error fetching events this week:", error);
      return [];
    }

    return (data as Event[]) || [];
  },
  ["events-this-week"],
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
    const supabase = await createClient();

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
  ["event-by-slug"],
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
    Map<string, { title?: string; description?: string; text_content?: string }>
  > => {
    if (contentIds.length === 0) return new Map();

    const supabase = await createClient();

    const { data: translations } = await supabase
      .from("content_translations")
      .select("content_id, field_name, translated_text")
      .eq("content_type", contentType)
      .in("content_id", contentIds)
      .eq("target_locale", targetLocale)
      .in("field_name", ["title", "description", "text_content"]);

    const result = new Map<
      string,
      { title?: string; description?: string; text_content?: string }
    >();

    if (translations) {
      for (const t of translations) {
        const existing = result.get(t.content_id) || {};
        if (t.field_name === "title") {
          existing.title = t.translated_text;
        } else if (t.field_name === "description") {
          existing.description = t.translated_text;
        } else if (t.field_name === "text_content") {
          existing.text_content = t.translated_text;
        }
        result.set(t.content_id, existing);
      }
    }

    return result;
  },
  ["translations-batch"],
  {
    revalidate: 300, // 5 minutes
    tags: [CACHE_TAGS.translations],
  }
);

/**
 * Cached blog categories.
 * Revalidates every hour - categories rarely change.
 */
export const getCachedBlogCategories = unstable_cache(
  async () => {
    const supabase = await createClient();

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
  ["blog-categories"],
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
    const supabase = await createClient();

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
