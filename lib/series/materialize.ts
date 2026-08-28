import { SupabaseClient } from "@supabase/supabase-js";
import { addMonths, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { generateSeriesInstances } from "@/lib/recurrence";
import type { EventSeries } from "@/lib/types";

const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";
export const ACTIVITY_GRAPH_CONFIRMATION_MAX_AGE_MS = 14 * 86_400_000;

export interface PlannedSeriesOccurrence {
  date: string;
  slug: string;
  startsAt: string;
  endsAt: string;
}

interface MaterializeOptions {
  now?: Date;
  strict?: boolean;
  occurrenceStatus?: "draft" | "published";
}

export function dalatDateKey(date: Date): string {
  return formatInTimeZone(date, DALAT_TIMEZONE, "yyyy-MM-dd");
}

/**
 * RRULE expansion operates on calendar dates, not instants. Constructing a
 * local-noon Date keeps date-fns calendar arithmetic stable across host
 * timezones and DST boundaries; the actual event instant is converted from
 * Đà Lạt local time only after the date has been selected.
 */
function calendarDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function sourceDateKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return value.slice(0, 10);
  return dalatDateKey(new Date(value));
}

export function isFreshActivityGraphSeries(
  series: Pick<EventSeries, "source_platform" | "last_confirmed_at">,
  now: Date = new Date(),
): boolean {
  if (series.source_platform !== "activity-graph") return true;
  if (!series.last_confirmed_at) return false;
  const confirmedAt = new Date(series.last_confirmed_at).getTime();
  if (!Number.isFinite(confirmedAt)) return false;
  return now.getTime() - confirmedAt <= ACTIVITY_GRAPH_CONFIRMATION_MAX_AGE_MS;
}

/** Build the still-upcoming occurrence schedule using Đà Lạt calendar days. */
export function planSeriesOccurrences(
  series: Pick<
    EventSeries,
    | "slug"
    | "rrule"
    | "starts_at_time"
    | "duration_minutes"
    | "first_occurrence"
    | "rrule_until"
    | "rrule_count"
  >,
  monthsAhead: number = 2,
  now: Date = new Date(),
): PlannedSeriesOccurrence[] {
  const today = dalatDateKey(now);
  const generateFrom = calendarDate(today);
  const generateUntil = addMonths(generateFrom, monthsAhead);
  const firstOccurrence = sourceDateKey(series.first_occurrence);
  const rruleUntil = series.rrule_until
    ? sourceDateKey(series.rrule_until)
    : null;

  const occurrenceDates = generateSeriesInstances(
    {
      rrule: series.rrule,
      // Deliberately omit a timezone suffix: generateSeriesInstances uses
      // host-local calendar operations, and every boundary here is local noon.
      first_occurrence: `${firstOccurrence}T12:00:00`,
      rrule_until: rruleUntil ? `${rruleUntil}T12:00:00` : null,
      rrule_count: series.rrule_count,
    },
    generateFrom,
    generateUntil,
  );

  return occurrenceDates
    .map((date) => {
      const dateKey = format(date, "yyyy-MM-dd");
      const startsAt = fromZonedTime(
        `${dateKey}T${series.starts_at_time}`,
        DALAT_TIMEZONE,
      );
      return {
        date: dateKey,
        slug: `${series.slug}-${format(date, "yyyyMMdd")}`,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(
          startsAt.getTime() + series.duration_minutes * 60_000,
        ).toISOString(),
      };
    })
    .filter(
      (occurrence) => new Date(occurrence.startsAt).getTime() > now.getTime(),
    );
}

function materializeFailure(
  series: Pick<EventSeries, "slug">,
  step: string,
  error: { message?: string } | null,
  strict: boolean,
): number {
  const message = `[series-materialize] ${step} failed for ${series.slug}: ${error?.message ?? "unknown error"}`;
  if (strict) throw new Error(message);
  console.error(message);
  return 0;
}

/**
 * Safety-unlist stale imported recurrence without affecting creator-managed
 * series. Returns true only when an Activity Graph series was paused.
 */
export async function pauseStaleActivityGraphSeries(
  supabase: SupabaseClient,
  series: EventSeries,
  now: Date = new Date(),
): Promise<boolean> {
  if (
    series.source_platform !== "activity-graph" ||
    isFreshActivityGraphSeries(series, now)
  ) {
    return false;
  }

  const { data, error } = await supabase.rpc(
    "pause_stale_activity_graph_series",
    { p_series_id: series.id, p_paused_at: now.toISOString() },
  );
  if (error) {
    throw new Error(
      `Stale Activity Graph series pause failed: ${error.message}`,
    );
  }
  return data === true;
}

/**
 * Top up materialized occurrences for a recurring series so upcoming events
 * always extend ~monthsAhead into the future.
 *
 * Series creation (app/api/series/route.ts) materializes an initial window and
 * stamps `instances_generated_until`; without this top-up the window drains as
 * time passes and the "recurring events floor" empties. Idempotent: scans the
 * rolling window and skips dates that already have an instance.
 *
 * The event field mapping mirrors app/api/series/route.ts — keep them in sync.
 */
export async function materializeSeriesOccurrences(
  supabase: SupabaseClient,
  series: EventSeries,
  monthsAhead: number = 2,
  options: MaterializeOptions = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const strict = options.strict ?? false;
  const occurrenceStatus = options.occurrenceStatus ?? "published";

  // Imported recurrence is public only while the source is being confirmed.
  // Legacy and creator-managed series have no source_platform marker and keep
  // their existing materialization behavior.
  if (!isFreshActivityGraphSeries(series, now)) return 0;

  const planned = planSeriesOccurrences(series, monthsAhead, now);
  const today = dalatDateKey(now);
  const generateUntil = addMonths(calendarDate(today), monthsAhead);

  // Always scan the small rolling window rather than trusting the watermark.
  // This repairs today's occurrence for series created by the old instant-based
  // boundary while remaining idempotent through series_instance_date.
  const { data: existing, error: existingError } = await supabase
    .from("events")
    .select("series_instance_date")
    .eq("series_id", series.id)
    .gte("series_instance_date", today);
  if (existingError) {
    return materializeFailure(
      series,
      "existing occurrence lookup",
      existingError,
      strict,
    );
  }
  const existingDates = new Set(
    (existing ?? [])
      .map((e) => e.series_instance_date as string)
      .filter(Boolean),
  );
  const missing = planned.filter(
    (occurrence) => !existingDates.has(occurrence.date),
  );

  if (missing.length === 0) {
    // Still advance the watermark so we don't rescan a dead window every run
    const { error } = await supabase
      .from("event_series")
      .update({ instances_generated_until: generateUntil.toISOString() })
      .eq("id", series.id);
    if (error)
      return materializeFailure(series, "watermark update", error, strict);
    return 0;
  }

  // venue_id lives on instances, not the series template — carry it forward
  // from the most recent instance so the WHERE link survives top-ups.
  const { data: lastInstance, error: lastInstanceError } = await supabase
    .from("events")
    .select("venue_id")
    .eq("series_id", series.id)
    .order("starts_at", { ascending: false })
    .limit(1);
  if (lastInstanceError) {
    return materializeFailure(
      series,
      "venue carry-forward lookup",
      lastInstanceError,
      strict,
    );
  }
  const venueId = lastInstance?.[0]?.venue_id ?? null;

  const eventInserts = missing.map((occurrence) => {
    return {
      slug: occurrence.slug,
      series_id: series.id,
      series_instance_date: occurrence.date,
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
      venue_id: series.venue_id ?? venueId,
      created_by: series.created_by,
      starts_at: occurrence.startsAt,
      ends_at: occurrence.endsAt,
      status: occurrenceStatus,
      is_exception: false,
      ...(series.source_platform === "activity-graph"
        ? { source_locale: "vi" }
        : {}),
      source_platform: series.source_platform ?? null,
      source_metadata: series.source_metadata ?? {},
      activity_kind: series.activity_kind ?? null,
      public_access: series.public_access ?? null,
      reservation_requirement: series.reservation_requirement ?? null,
      last_checked_at: series.last_checked_at ?? null,
      last_confirmed_at: series.last_confirmed_at ?? null,
      source_updated_at: series.source_updated_at ?? null,
      freshness_score: series.freshness_score ?? null,
    };
  });

  const { error: insertError } = await supabase
    .from("events")
    .upsert(eventInserts, {
      onConflict: "series_id,series_instance_date",
      ignoreDuplicates: true,
    });

  if (insertError) {
    return materializeFailure(series, "occurrence insert", insertError, strict);
  }

  const { error: watermarkError } = await supabase
    .from("event_series")
    .update({ instances_generated_until: generateUntil.toISOString() })
    .eq("id", series.id);
  if (watermarkError) {
    return materializeFailure(
      series,
      "watermark update",
      watermarkError,
      strict,
    );
  }

  return eventInserts.length;
}

/**
 * Cron-safe top-up. Activity Graph rows are inserted fail-closed and become
 * public only through a database function that locks the current series row
 * and rechecks active/admin-suppression/freshness state. Creator-managed
 * series preserve their existing direct-publication behavior.
 */
export async function topUpSeriesOccurrences(
  supabase: SupabaseClient,
  series: EventSeries,
  monthsAhead: number = 2,
  now: Date = new Date(),
): Promise<number> {
  if (series.source_platform !== "activity-graph") {
    return materializeSeriesOccurrences(supabase, series, monthsAhead, { now });
  }
  if (!isFreshActivityGraphSeries(series, now)) return 0;

  const occurrenceDates = planSeriesOccurrences(series, monthsAhead, now).map(
    (occurrence) => occurrence.date,
  );
  const drafted = await materializeSeriesOccurrences(
    supabase,
    series,
    monthsAhead,
    {
      now,
      strict: true,
      occurrenceStatus: "draft",
    },
  );
  const { data, error } = await supabase.rpc(
    "publish_verified_activity_graph_series_occurrences",
    {
      p_series_id: series.id,
      p_occurrence_dates: occurrenceDates,
      p_published_at: now.toISOString(),
    },
  );
  if (error) {
    throw new Error(`Graph occurrence publication failed: ${error.message}`);
  }
  const published = Boolean(
    data &&
    typeof data === "object" &&
    "published" in data &&
    data.published === true,
  );
  return published ? drafted : 0;
}
