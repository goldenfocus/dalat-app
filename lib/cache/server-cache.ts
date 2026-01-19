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
    try {
      const supabase = await createClient();

      // Try deduplicated RPC first
      let { data, error } = await supabase.rpc(
        "get_events_by_lifecycle_deduplicated",
        {
          p_lifecycle: lifecycle,
          p_limit: 20,
        }
      );

      // Fallback to non-deduplicated function if the new one doesn't exist
      if (error?.code === "PGRST202") {
        const fallback = await supabase.rpc("get_events_by_lifecycle", {
          p_lifecycle: lifecycle,
          p_limit: 20,
        });
        data = fallback.data;
        error = fallback.error;

        // Map to expected format with null series data
        if (data && !error) {
          return (data as Event[]).map((e) => ({
            ...e,
            series_slug: null,
            series_rrule: null,
            is_recurring: !!e.series_id,
          }));
        }
      }

      if (error) {
        console.error("Error fetching events by lifecycle:", error);
        return [];
      }

      return (data as EventWithSeriesData[]) || [];
    } catch (err) {
      console.error("Exception in getCachedEventsByLifecycle:", err);
      return [];
    }
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

/**
 * Cached batch event counts for multiple events.
 * More efficient than individual calls for list views.
 */
export const getCachedEventCountsBatch = unstable_cache(
  async (eventIds: string[]): Promise<Record<string, EventCounts>> => {
    try {
      if (eventIds.length === 0) return {};

      const supabase = await createClient();

      const { data: rsvps, error } = await supabase
        .from("rsvps")
        .select("event_id, status, plus_ones")
        .in("event_id", eventIds);

      if (error) {
        console.error("Error fetching batch event counts:", error);
        return {};
      }

      const counts: Record<string, EventCounts> = {};

      for (const eventId of eventIds) {
        const eventRsvps = rsvps?.filter((r) => r.event_id === eventId) || [];
        const goingRsvps = eventRsvps.filter((r) => r.status === "going");
        const waitlistRsvps = eventRsvps.filter((r) => r.status === "waitlist");
        const interestedRsvps = eventRsvps.filter(
          (r) => r.status === "interested"
        );

        counts[eventId] = {
          event_id: eventId,
          going_count: goingRsvps.length,
          waitlist_count: waitlistRsvps.length,
          going_spots: goingRsvps.reduce(
            (sum, r) => sum + 1 + (r.plus_ones || 0),
            0
          ),
          interested_count: interestedRsvps.length,
        };
      }

      return counts;
    } catch (err) {
      console.error("Exception in getCachedEventCountsBatch:", err);
      return {};
    }
  },
  ["event-counts-batch"],
  {
    revalidate: 30, // 30 seconds
    tags: [CACHE_TAGS.events],
  }
);
