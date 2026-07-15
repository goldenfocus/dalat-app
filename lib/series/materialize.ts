import { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, format } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { generateSeriesInstances } from "@/lib/recurrence";
import type { EventSeries } from "@/lib/types";

const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";

/**
 * Top up materialized occurrences for a recurring series so upcoming events
 * always extend ~monthsAhead into the future.
 *
 * Series creation (app/api/series/route.ts) materializes an initial window and
 * stamps `instances_generated_until`; without this top-up the window drains as
 * time passes and the "recurring events floor" empties. Idempotent: generates
 * only past the watermark and skips dates that already have an instance.
 *
 * The event field mapping mirrors app/api/series/route.ts — keep them in sync.
 */
export async function materializeSeriesOccurrences(
  supabase: SupabaseClient,
  series: EventSeries,
  monthsAhead: number = 2
): Promise<number> {
  const now = new Date();
  const generateUntil = addMonths(now, monthsAhead);
  const watermark = series.instances_generated_until
    ? new Date(series.instances_generated_until)
    : now;

  if (watermark >= generateUntil) return 0; // already generated past the horizon

  const generateFrom = watermark > now ? watermark : now;

  // Dates that already have an instance (watermark overlap, manual creation)
  const { data: existing } = await supabase
    .from("events")
    .select("series_instance_date")
    .eq("series_id", series.id)
    .gte("series_instance_date", format(generateFrom, "yyyy-MM-dd"));
  const existingDates = (existing ?? [])
    .map((e) => e.series_instance_date as string)
    .filter(Boolean);

  const occurrenceDates = generateSeriesInstances(
    series,
    generateFrom,
    generateUntil,
    existingDates
  );

  if (occurrenceDates.length === 0) {
    // Still advance the watermark so we don't rescan a dead window every run
    await supabase
      .from("event_series")
      .update({ instances_generated_until: generateUntil.toISOString() })
      .eq("id", series.id);
    return 0;
  }

  // venue_id lives on instances, not the series template — carry it forward
  // from the most recent instance so the WHERE link survives top-ups.
  const { data: lastInstance } = await supabase
    .from("events")
    .select("venue_id")
    .eq("series_id", series.id)
    .order("starts_at", { ascending: false })
    .limit(1);
  const venueId = lastInstance?.[0]?.venue_id ?? null;

  const eventInserts = occurrenceDates.map((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const instanceSlug = `${series.slug}-${format(date, "yyyyMMdd")}`;

    // Combine date and time in Đà Lạt timezone, then convert to UTC
    const localDateTime = `${dateStr}T${series.starts_at_time}`;
    const startsAt = fromZonedTime(localDateTime, DALAT_TIMEZONE);
    const endsAt = new Date(
      startsAt.getTime() + series.duration_minutes * 60 * 1000
    );

    return {
      slug: instanceSlug,
      series_id: series.id,
      series_instance_date: dateStr,
      title: series.title,
      description: series.description || null,
      image_url: series.image_url || null,
      location_name: series.location_name || null,
      address: series.address || null,
      google_maps_url: series.google_maps_url || null,
      latitude: series.latitude ?? null,
      longitude: series.longitude ?? null,
      external_chat_url: series.external_chat_url || null,
      is_online: series.is_online || false,
      online_link: series.is_online ? series.online_link || null : null,
      title_position: series.title_position || "bottom",
      image_fit: series.image_fit || "cover",
      focal_point: series.focal_point || null,
      timezone: DALAT_TIMEZONE,
      capacity: series.capacity || null,
      price_type: series.price_type || null,
      ticket_tiers: series.ticket_tiers || null,
      tribe_id: series.tribe_id || null,
      organizer_id: series.organizer_id || null,
      venue_id: venueId,
      created_by: series.created_by,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "published" as const,
      is_exception: false,
    };
  });

  const { error: insertError } = await supabase
    .from("events")
    .insert(eventInserts);

  if (insertError) {
    console.error(
      `[series-materialize] Failed to top up ${series.slug}:`,
      insertError
    );
    return 0;
  }

  await supabase
    .from("event_series")
    .update({ instances_generated_until: generateUntil.toISOString() })
    .eq("id", series.id);

  return eventInserts.length;
}
