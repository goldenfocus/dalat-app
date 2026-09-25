import { after } from "next/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import {
  detectLanguage,
  translateFieldsToLocale,
} from "@/lib/google-translate";
import { notifyEventTranslationCompletion } from "@/lib/seo/indexnow-events";
import { TRANSLATION_NEEDED_AT_KEY } from "@/lib/translation-sweep";
import { CONTENT_LOCALES, type ContentLocale } from "@/lib/types";

const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Short event copy should reach the production safety-net model quickly. */
const EVENT_PROVIDER_TIMEOUT_MS = 20_000;
const LOCALE_CONCURRENCY = 3;

export const EVENT_TRANSLATION_FIELDS = ["title", "description"] as const;
export type EventTranslationField = (typeof EVENT_TRANSLATION_FIELDS)[number];

/** Events translated per cron invocation. Each event fans out to ~11 locales. */
export const EVENT_TRANSLATION_BATCH_LIMIT = 3;
/** Candidate scan before coverage filtering. The write batch stays smaller. */
export const EVENT_TRANSLATION_SCAN_LIMIT = 40;

export interface EventTranslationSourceField {
  field_name: EventTranslationField;
  text: string;
}

export interface StoredEventTranslation {
  target_locale: string;
  field_name: string;
  translated_text: string | null;
}

export interface PlannedLocaleWrite {
  locale: ContentLocale;
  fields: EventTranslationSourceField[];
}

export interface EventTranslationCandidate {
  id: string;
  startsAt: string | null;
  translationNeededAt: string | null;
}

export function isSupportedContentLocale(
  value: string | null | undefined,
): value is ContentLocale {
  return !!value && (CONTENT_LOCALES as readonly string[]).includes(value);
}

/**
 * Locales that must be stored for an event. The source locale is served from
 * the event row itself, so it is not a translation target.
 * An unknown source locale still requires every locale until detection runs.
 */
export function nonSourceEventLocales(
  sourceLocale: string | null | undefined,
): ContentLocale[] {
  if (!isSupportedContentLocale(sourceLocale)) return [...CONTENT_LOCALES];
  return CONTENT_LOCALES.filter((locale) => locale !== sourceLocale);
}

export function eventTranslationFields(input: {
  title?: string | null;
  description?: string | null;
}): EventTranslationSourceField[] {
  const fields: EventTranslationSourceField[] = [];
  if (input.title?.trim()) {
    fields.push({ field_name: "title", text: input.title });
  }
  if (input.description?.trim()) {
    fields.push({ field_name: "description", text: input.description });
  }
  return fields;
}

/**
 * Locales and fields that still need a write. A second call with those
 * fields filled returns an empty plan (idempotent).
 */
export function planEventLocaleWrites(
  source: {
    sourceLocale: string | null;
    fields: EventTranslationSourceField[];
  },
  existing: StoredEventTranslation[],
): PlannedLocaleWrite[] {
  if (source.fields.length === 0) return [];
  const covered = new Map<string, Set<string>>();
  for (const row of existing) {
    if (!row.translated_text?.trim()) continue;
    const fields = covered.get(row.target_locale) ?? new Set<string>();
    fields.add(row.field_name);
    covered.set(row.target_locale, fields);
  }

  const planned: PlannedLocaleWrite[] = [];
  for (const locale of nonSourceEventLocales(source.sourceLocale)) {
    const have = covered.get(locale);
    const missing = source.fields.filter((field) => !have?.has(field.field_name));
    if (missing.length > 0) planned.push({ locale, fields: missing });
  }
  return planned;
}

/** Midnight at the start of today in Đà Lạt. Same-day events stay eligible after they begin. */
export function eventTranslationWindowStart(now: Date): Date {
  const day = formatInTimeZone(now, DALAT_TIMEZONE, "yyyy-MM-dd");
  return fromZonedTime(`${day}T00:00:00`, DALAT_TIMEZONE);
}

export function eventTranslationQueueClears(options: {
  sourceLocale: string | null;
  planned: PlannedLocaleWrite[];
}): boolean {
  return isSupportedContentLocale(options.sourceLocale) && options.planned.length === 0;
}

function startInstant(startsAt: string | null): number | null {
  if (!startsAt) return null;
  const parsed = Date.parse(startsAt);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Soonest start first among events happening today or later (Đà Lạt).
 * Older flagged rows follow, most recently started first, so a months-old
 * backlog cannot sit in front of an event happening tonight.
 */
export function selectEventTranslationBatch<T extends EventTranslationCandidate>(
  candidates: T[],
  now: Date,
  limit: number,
): T[] {
  const windowStart = eventTranslationWindowStart(now).getTime();
  const eligible = candidates.filter((candidate) => {
    if (candidate.translationNeededAt) return true;
    const start = startInstant(candidate.startsAt);
    return start !== null && start >= windowStart;
  });

  const ranked = [...eligible].sort((a, b) => {
    const rankA = translationRank(a, windowStart);
    const rankB = translationRank(b, windowStart);
    if (rankA.bucket !== rankB.bucket) return rankA.bucket - rankB.bucket;
    if (rankA.sort !== rankB.sort) return rankA.sort - rankB.sort;
    const neededA = a.translationNeededAt ?? "9999";
    const neededB = b.translationNeededAt ?? "9999";
    if (neededA !== neededB) return neededA < neededB ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return ranked.slice(0, Math.max(0, limit));
}

function translationRank(
  candidate: EventTranslationCandidate,
  windowStartMs: number,
): { bucket: number; sort: number } {
  const start = startInstant(candidate.startsAt);
  if (start === null) return { bucket: 2, sort: 0 };
  if (start >= windowStartMs) return { bucket: 0, sort: start };
  return { bucket: 1, sort: -start };
}

export interface EventTranslationRunResult {
  eventId: string;
  skipped?: "not_published" | "no_text";
  missingBefore: number;
  localesWritten: number;
  localesFailed: number;
  cleared: boolean;
  complete: boolean;
}

interface EventTranslationRow {
  id: string;
  title: string | null;
  description: string | null;
  source_locale: string | null;
  starts_at: string | null;
  status: string;
  source_metadata: Record<string, unknown> | null;
}

function translationNeededAt(metadata: Record<string, unknown> | null): string | null {
  const value = metadata?.[TRANSLATION_NEEDED_AT_KEY];
  return typeof value === "string" && value.trim() ? value : null;
}

function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials are not configured");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

async function loadEvent(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventTranslationRow | null> {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, source_locale, starts_at, status, source_metadata")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`[event-translation] load failed: ${error.message}`);
  return (data as EventTranslationRow | null) ?? null;
}

async function loadTranslationRows(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<Map<string, StoredEventTranslation[]>> {
  const byEvent = new Map<string, StoredEventTranslation[]>();
  if (eventIds.length === 0) return byEvent;
  const pageSize = 1000;
  for (let index = 0; index < eventIds.length; index += 50) {
    const chunk = eventIds.slice(index, index + 50);
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("content_translations")
        .select("content_id, target_locale, field_name, translated_text")
        .eq("content_type", "event")
        .in("content_id", chunk)
        .in("field_name", [...EVENT_TRANSLATION_FIELDS])
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (error) {
        throw new Error(`[event-translation] coverage query failed: ${error.message}`);
      }
      for (const row of data ?? []) {
        const list = byEvent.get(row.content_id) ?? [];
        list.push({
          target_locale: row.target_locale,
          field_name: row.field_name,
          translated_text: row.translated_text,
        });
        byEvent.set(row.content_id, list);
      }
      if (!data || data.length < pageSize) break;
    }
  }
  return byEvent;
}

async function persistSourceLocale(
  supabase: SupabaseClient,
  eventId: string,
  sourceLocale: ContentLocale,
): Promise<void> {
  const { error } = await supabase
    .from("events")
    .update({ source_locale: sourceLocale })
    .eq("id", eventId);
  if (error) {
    throw new Error(`[event-translation] source_locale update failed: ${error.message}`);
  }
}

async function clearTranslationNeededAt(
  supabase: SupabaseClient,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("events")
    .select("source_metadata")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`[event-translation] metadata read failed: ${error.message}`);
  const metadata =
    data?.source_metadata && typeof data.source_metadata === "object"
      ? { ...(data.source_metadata as Record<string, unknown>) }
      : null;
  if (!metadata || metadata[TRANSLATION_NEEDED_AT_KEY] == null) return false;
  delete metadata[TRANSLATION_NEEDED_AT_KEY];
  const { error: updateError } = await supabase
    .from("events")
    .update({ source_metadata: metadata })
    .eq("id", eventId)
    .eq("status", "published");
  if (updateError) {
    throw new Error(`[event-translation] clear translation_needed_at failed: ${updateError.message}`);
  }
  return true;
}

async function upsertMissingFields(
  supabase: SupabaseClient,
  eventId: string,
  sourceLocale: ContentLocale,
  locale: ContentLocale,
  translated: Record<string, string>,
  fields: EventTranslationSourceField[],
): Promise<number> {
  const rows = fields
    .map((field) => {
      const text = translated[field.field_name];
      if (typeof text !== "string" || !text.trim()) return null;
      return {
        content_type: "event",
        content_id: eventId,
        source_locale: sourceLocale,
        target_locale: locale,
        field_name: field.field_name,
        translated_text: text.trim(),
        translation_status: "auto",
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (rows.length === 0) return 0;

  // ignoreDuplicates: a human-owned row that landed first is left alone.
  // A retry sees that text and drops the locale from the plan.
  const { data, error } = await supabase
    .from("content_translations")
    .upsert(rows, {
      onConflict: "content_type,content_id,target_locale,field_name",
      ignoreDuplicates: true,
    })
    .select("field_name");
  if (error) throw new Error(`[event-translation] upsert failed: ${error.message}`);
  return data?.length ?? 0;
}

/**
 * Fill missing non-source title/description locales for one published event.
 * Safe to call repeatedly: existing non-blank rows are not rewritten.
 */
export async function translatePublishedEvent(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventTranslationRunResult> {
  const event = await loadEvent(supabase, eventId);
  if (!event || event.status !== "published") {
    return {
      eventId,
      skipped: "not_published",
      missingBefore: 0,
      localesWritten: 0,
      localesFailed: 0,
      cleared: false,
      complete: false,
    };
  }

  const fields = eventTranslationFields(event);
  if (fields.length === 0) {
    return {
      eventId,
      skipped: "no_text",
      missingBefore: 0,
      localesWritten: 0,
      localesFailed: 0,
      cleared: false,
      complete: false,
    };
  }

  let sourceLocale = isSupportedContentLocale(event.source_locale)
    ? event.source_locale
    : null;
  if (!sourceLocale) {
    sourceLocale = await detectLanguage(fields.map((field) => field.text).join("\n"), {
      timeoutMs: EVENT_PROVIDER_TIMEOUT_MS,
    });
    await persistSourceLocale(supabase, eventId, sourceLocale);
  }
  const resolvedSourceLocale: ContentLocale = sourceLocale;

  const coverage = await loadTranslationRows(supabase, [eventId]);
  const planned = planEventLocaleWrites(
    { sourceLocale: resolvedSourceLocale, fields },
    coverage.get(eventId) ?? [],
  );
  let localesWritten = 0;
  let localesFailed = 0;

  await mapWithConcurrency(planned, LOCALE_CONCURRENCY, async (item) => {
    try {
      const translated = await translateFieldsToLocale(item.fields, item.locale, {
        timeoutMs: EVENT_PROVIDER_TIMEOUT_MS,
      });
      const wrote = await upsertMissingFields(
        supabase,
        eventId,
        resolvedSourceLocale,
        item.locale,
        translated,
        item.fields,
      );
      if (wrote > 0) localesWritten += 1;
    } catch (error) {
      localesFailed += 1;
      console.error(
        `[event-translation] ${eventId} ${item.locale}:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  const refreshed = await loadTranslationRows(supabase, [eventId]);
  const remaining = planEventLocaleWrites(
    { sourceLocale: resolvedSourceLocale, fields },
    refreshed.get(eventId) ?? [],
  );
  const complete = eventTranslationQueueClears({
    sourceLocale: resolvedSourceLocale,
    planned: remaining,
  });
  let cleared = false;
  if (complete) {
    cleared = await clearTranslationNeededAt(supabase, eventId);
    if (localesWritten > 0) {
      try {
        await notifyEventTranslationCompletion(supabase, [eventId]);
      } catch (error) {
        console.warn(
          `[event-translation] completion notify failed for ${eventId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return {
    eventId,
    missingBefore: planned.length,
    localesWritten,
    localesFailed,
    cleared,
    complete,
  };
}

async function loadSweepCandidates(
  supabase: SupabaseClient,
  now: Date,
): Promise<EventTranslationRow[]> {
  const windowStart = eventTranslationWindowStart(now).toISOString();
  const select =
    "id, title, description, source_locale, starts_at, status, source_metadata";

  const flagged = await supabase
    .from("events")
    .select(select)
    .eq("status", "published")
    .not(`source_metadata->${TRANSLATION_NEEDED_AT_KEY}`, "is", null)
    .order("starts_at", { ascending: true })
    .limit(EVENT_TRANSLATION_SCAN_LIMIT);
  if (flagged.error) {
    throw new Error(`[event-translation] flagged query failed: ${flagged.error.message}`);
  }

  const upcoming = await supabase
    .from("events")
    .select(select)
    .eq("status", "published")
    .gte("starts_at", windowStart)
    .order("starts_at", { ascending: true })
    .limit(EVENT_TRANSLATION_SCAN_LIMIT);
  if (upcoming.error) {
    throw new Error(`[event-translation] upcoming query failed: ${upcoming.error.message}`);
  }

  const byId = new Map<string, EventTranslationRow>();
  for (const row of [...(flagged.data ?? []), ...(upcoming.data ?? [])] as EventTranslationRow[]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export interface EventTranslationSweepResult {
  scanned: number;
  selected: string[];
  clearedWithoutWork: number;
  results: EventTranslationRunResult[];
}

/**
 * Event-only sweep. Blog and moment jobs are never loaded, so a failing
 * blog translation cannot sit in front of a published event.
 */
export async function sweepPublishedEventTranslations(
  supabase: SupabaseClient,
  options: { now?: Date; limit?: number } = {},
): Promise<EventTranslationSweepResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? EVENT_TRANSLATION_BATCH_LIMIT;
  const rows = await loadSweepCandidates(supabase, now);
  const coverage = await loadTranslationRows(
    supabase,
    rows.map((row) => row.id),
  );

  const incomplete: Array<EventTranslationCandidate & { missing: number }> = [];
  let clearedWithoutWork = 0;
  for (const row of rows) {
    const fields = eventTranslationFields(row);
    const sourceLocale = isSupportedContentLocale(row.source_locale)
      ? row.source_locale
      : null;
    const neededAt = translationNeededAt(row.source_metadata);
    if (fields.length === 0) continue;
    const planned = planEventLocaleWrites(
      { sourceLocale, fields },
      coverage.get(row.id) ?? [],
    );
    if (
      eventTranslationQueueClears({ sourceLocale, planned }) &&
      neededAt
    ) {
      if (await clearTranslationNeededAt(supabase, row.id)) clearedWithoutWork += 1;
      continue;
    }
    if (planned.length === 0 && sourceLocale) continue;
    incomplete.push({
      id: row.id,
      startsAt: row.starts_at,
      translationNeededAt: neededAt,
      missing: planned.length,
    });
  }

  const selected = selectEventTranslationBatch(incomplete, now, limit);
  const results: EventTranslationRunResult[] = [];
  for (const candidate of selected) {
    results.push(await translatePublishedEvent(supabase, candidate.id));
  }

  return {
    scanned: rows.length,
    selected: selected.map((candidate) => candidate.id),
    clearedWithoutWork,
    results,
  };
}

async function runPublishedEventTranslation(eventId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const result = await translatePublishedEvent(supabase, eventId);
    console.warn("[event-translation] finished", result);
  } catch (error) {
    console.error(
      "[event-translation] background run failed",
      eventId,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Translate one published event after the HTTP response. Publish handlers
 * stay fast. If this invocation does not finish, the cron sweep retries
 * from translation_needed_at and from published events starting today or later.
 * Outside a request, after() throws and the cron remains the durable path.
 */
export function schedulePublishedEventTranslation(eventId: string): void {
  if (!eventId) return;
  try {
    after(() => {
      void runPublishedEventTranslation(eventId);
    });
  } catch (error) {
    console.warn(
      "[event-translation] could not schedule after(); cron will sweep",
      eventId,
      error instanceof Error ? error.message : error,
    );
  }
}

export function schedulePublishedEventTranslations(
  eventIds: Array<string | null | undefined>,
): void {
  for (const eventId of eventIds) {
    if (eventId) schedulePublishedEventTranslation(eventId);
  }
}
