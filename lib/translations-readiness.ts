import type { SupabaseClient } from "@supabase/supabase-js";
import { CONTENT_LOCALES, type ContentLocale } from "@/lib/types";

export const EVENT_INDEXABLE_TRANSLATION_FIELDS = ["title", "description"] as const;
export const MIN_EVENT_TITLE_LENGTH = 3;
export const MIN_EVENT_DESCRIPTION_LENGTH = 80;

export type EventIndexableTranslationField =
  (typeof EVENT_INDEXABLE_TRANSLATION_FIELDS)[number];

/**
 * The event columns required to decide which localized URLs are safe to expose
 * to search engines. This intentionally stays small so sitemap callers can
 * evaluate hundreds of events without fetching full event rows.
 */
export interface EventIndexingSource {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  address: string | null;
  venue_id: string | null;
  is_online: boolean;
  online_link: string | null;
  image_url: string | null;
  tribe_id: string | null;
  tribe_visibility: string | null;
  source_locale: string | null;
  status: string;
  updated_at: string;
}

/** Public translation columns used by both single-event and bulk evaluators. */
export interface EventIndexingTranslationRow {
  content_id: string;
  target_locale: string;
  field_name: string;
  translated_text: string;
  updated_at: string;
}

export interface EventLocaleIndexingReadiness {
  locale: ContentLocale;
  path: string;
  isSourceLocale: boolean;
  /** Translation-only result; source locale is intrinsically translated. */
  translationReady: boolean;
  /** Final result: published source content AND this locale are ready. */
  ready: boolean;
  missingFields: EventIndexableTranslationField[];
  nonSubstantiveFields: EventIndexableTranslationField[];
  /**
   * Diagnostic only. Event.updated_at also moves for images, venue, pricing,
   * and other non-translatable edits, so it must not by itself remove an
   * otherwise complete localized URL from the index.
   */
  staleFields: EventIndexableTranslationField[];
  translationUpdatedAt: string | null;
}

export type EventContentBlockingIssue =
  | "not_publicly_discoverable"
  | "unknown_source_locale"
  | "title_too_short"
  | "description_too_short"
  | "invalid_start_date"
  | "invalid_end_date"
  | "missing_physical_location"
  | "missing_public_online_link";

export type EventContentWarning = "missing_uploaded_image" | "invalid_uploaded_image_url";

export interface EventContentIndexingReadiness {
  ready: boolean;
  blockingIssues: EventContentBlockingIssue[];
  warnings: EventContentWarning[];
  /** Always available for a real event slug; warnings above are non-blocking. */
  ogImageFallbackPath: string;
}

export interface EventIndexingReadiness {
  eventId: string;
  slug: string;
  sourceLocale: ContentLocale;
  published: boolean;
  contentReady: boolean;
  content: EventContentIndexingReadiness;
  requiredFields: EventIndexableTranslationField[];
  locales: EventLocaleIndexingReadiness[];
  readyLocales: ContentLocale[];
  readyPaths: string[];
  allLocalesReady: boolean;
  /** Latest source or translation change, suitable for sitemap lastmod. */
  lastModified: string;
}

const DEFAULT_LOCALE: ContentLocale = "en";

export function eventLocalePath(locale: ContentLocale, slug: string): string {
  const eventPath = `/events/${slug}`;
  return locale === DEFAULT_LOCALE ? eventPath : `/${locale}${eventPath}`;
}

function validLocale(locale: string | null): locale is ContentLocale {
  return CONTENT_LOCALES.includes(locale as ContentLocale);
}

function normalizedLength(value: string): number {
  return Array.from(value.replace(/\s+/g, " ").trim()).length;
}

/**
 * Reject blank and obviously placeholder-sized translation rows without
 * rejecting proper names that legitimately remain the same in two languages.
 * For descriptions, the floor scales very conservatively with source length
 * so compact Chinese/Japanese/Thai translations remain valid.
 */
export function isSubstantiveEventTranslation(
  field: EventIndexableTranslationField,
  translatedText: string,
  sourceText: string,
  targetLocale: ContentLocale = DEFAULT_LOCALE
): boolean {
  const translatedLength = normalizedLength(translatedText);
  const sourceLength = normalizedLength(sourceText);

  if (field === "title") {
    return translatedLength >= MIN_EVENT_TITLE_LENGTH;
  }

  // Logographic and some compact-script translations can carry the same
  // meaning in fewer Unicode code points than Latin-script source text.
  const compressionFactor = targetLocale === "zh" || targetLocale === "ja"
    ? 0.45
    : targetLocale === "ko" || targetLocale === "th"
      ? 0.65
      : 1;
  const minimumDescriptionLength = Math.min(
    MIN_EVENT_DESCRIPTION_LENGTH,
    Math.ceil(Math.max(sourceLength, MIN_EVENT_DESCRIPTION_LENGTH) * compressionFactor)
  );
  return translatedLength >= minimumDescriptionLength;
}

function requiredFieldsForEvent(
  _event: EventIndexingSource
): EventIndexableTranslationField[] {
  // A title-only event is a discoverability card, not an index-worthy landing
  // page. Every published locale needs substantive descriptive content.
  return [...EVENT_INDEXABLE_TRANSLATION_FIELDS];
}

function isUsablePublicHttpUrl(value: string | null): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^(fc|fd|fe8|fe9|fea|feb)/.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function evaluateEventSourceContent(
  event: EventIndexingSource
): EventContentIndexingReadiness {
  const blockingIssues: EventContentBlockingIssue[] = [];
  const warnings: EventContentWarning[] = [];

  // Worker clients use the service role, so enforce the same public boundary
  // that anon RLS gives the sitemap before sending anything to IndexNow.
  if (event.tribe_id && event.tribe_visibility !== "public") {
    blockingIssues.push("not_publicly_discoverable");
  }
  if (!validLocale(event.source_locale)) {
    blockingIssues.push("unknown_source_locale");
  }
  if (normalizedLength(event.title) < MIN_EVENT_TITLE_LENGTH) {
    blockingIssues.push("title_too_short");
  }
  if (normalizedLength(event.description ?? "") < MIN_EVENT_DESCRIPTION_LENGTH) {
    blockingIssues.push("description_too_short");
  }

  const startsAt = Date.parse(event.starts_at);
  const startYear = Number.isFinite(startsAt) ? new Date(startsAt).getUTCFullYear() : NaN;
  if (!Number.isFinite(startsAt) || startYear < 2000 || startYear > 2100) {
    blockingIssues.push("invalid_start_date");
  }
  if (event.ends_at) {
    const endsAt = Date.parse(event.ends_at);
    if (!Number.isFinite(endsAt) || !Number.isFinite(startsAt) || endsAt < startsAt) {
      blockingIssues.push("invalid_end_date");
    }
  }

  if (event.is_online) {
    if (!isUsablePublicHttpUrl(event.online_link)) {
      blockingIssues.push("missing_public_online_link");
    }
  } else {
    const venueBacked = Boolean(event.venue_id?.trim());
    const directLocationBacked =
      normalizedLength(event.location_name ?? "") >= 3 &&
      normalizedLength(event.address ?? "") >= 8;
    if (!venueBacked && !directLocationBacked) {
      blockingIssues.push("missing_physical_location");
    }
  }

  if (!event.image_url?.trim()) {
    warnings.push("missing_uploaded_image");
  } else if (!isUsablePublicHttpUrl(event.image_url)) {
    warnings.push("invalid_uploaded_image_url");
  }

  return {
    ready: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    ogImageFallbackPath: `/events/${event.slug}/og-image`,
  };
}

function latestIso(values: Array<string | null | undefined>, fallback: string): string {
  let latestValue = fallback;
  let latestTime = Date.parse(fallback);
  if (!Number.isFinite(latestTime)) latestTime = 0;

  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > latestTime) {
      latestTime = time;
      latestValue = value;
    }
  }

  return latestValue;
}

/** Pure, deterministic evaluator used by the bulk and single-event paths. */
export function evaluateEventIndexingReadiness(
  event: EventIndexingSource,
  rows: EventIndexingTranslationRow[]
): EventIndexingReadiness {
  const sourceLocale = validLocale(event.source_locale)
    ? event.source_locale
    : DEFAULT_LOCALE;
  const requiredFields = requiredFieldsForEvent(event);
  const published = event.status === "published";
  const content = evaluateEventSourceContent(event);
  const sourceText: Record<EventIndexableTranslationField, string> = {
    title: event.title,
    description: event.description ?? "",
  };

  const rowsByLocaleAndField = new Map<string, EventIndexingTranslationRow>();
  for (const row of rows) {
    if (row.content_id !== event.id || !validLocale(row.target_locale)) continue;
    if (!EVENT_INDEXABLE_TRANSLATION_FIELDS.includes(row.field_name as EventIndexableTranslationField)) continue;
    rowsByLocaleAndField.set(`${row.target_locale}:${row.field_name}`, row);
  }

  const sourceUpdatedAt = Date.parse(event.updated_at);
  const locales = CONTENT_LOCALES.map((locale): EventLocaleIndexingReadiness => {
    const isSourceLocale = locale === sourceLocale;
    const missingFields: EventIndexableTranslationField[] = [];
    const nonSubstantiveFields: EventIndexableTranslationField[] = [];
    const staleFields: EventIndexableTranslationField[] = [];
    const localeRows: EventIndexingTranslationRow[] = [];

    for (const field of requiredFields) {
      if (isSourceLocale) {
        continue;
      }

      const row = rowsByLocaleAndField.get(`${locale}:${field}`);
      if (!row) {
        missingFields.push(field);
        continue;
      }
      localeRows.push(row);
      if (!isSubstantiveEventTranslation(field, row.translated_text, sourceText[field], locale)) {
        nonSubstantiveFields.push(field);
      }
      const translatedAt = Date.parse(row.updated_at);
      if (
        Number.isFinite(sourceUpdatedAt) &&
        (!Number.isFinite(translatedAt) || translatedAt < sourceUpdatedAt)
      ) {
        staleFields.push(field);
      }
    }

    const translationReady = missingFields.length === 0 && nonSubstantiveFields.length === 0;
    return {
      locale,
      path: eventLocalePath(locale, event.slug),
      isSourceLocale,
      translationReady,
      ready: published && content.ready && translationReady,
      missingFields,
      nonSubstantiveFields,
      staleFields,
      translationUpdatedAt: localeRows.length
        ? latestIso(localeRows.map((row) => row.updated_at), localeRows[0].updated_at)
        : null,
    };
  });

  const readyLocales = locales.filter((locale) => locale.ready).map((locale) => locale.locale);
  const readyPaths = locales.filter((locale) => locale.ready).map((locale) => locale.path);
  const translationTimestamps = rows
    .filter((row) => row.content_id === event.id)
    .map((row) => row.updated_at);

  return {
    eventId: event.id,
    slug: event.slug,
    sourceLocale,
    published,
    contentReady: content.ready,
    content,
    requiredFields,
    locales,
    readyLocales,
    readyPaths,
    allLocalesReady: readyLocales.length === CONTENT_LOCALES.length,
    lastModified: latestIso([event.updated_at, ...translationTimestamps], event.updated_at),
  };
}

/**
 * Bulk evaluator for sitemap generation. Query event rows and translation rows
 * once, then group in memory rather than issuing one database request per URL.
 */
export function evaluateEventIndexingReadinessBatch(
  events: EventIndexingSource[],
  rows: EventIndexingTranslationRow[]
): Map<string, EventIndexingReadiness> {
  const rowsByEvent = new Map<string, EventIndexingTranslationRow[]>();
  for (const row of rows) {
    const eventRows = rowsByEvent.get(row.content_id) ?? [];
    eventRows.push(row);
    rowsByEvent.set(row.content_id, eventRows);
  }

  return new Map(
    events.map((event) => [
      event.id,
      evaluateEventIndexingReadiness(event, rowsByEvent.get(event.id) ?? []),
    ])
  );
}

/** Server-side single-event query used by mutation/completion callbacks. */
export async function getEventIndexingReadiness(
  supabase: SupabaseClient,
  eventId: string
): Promise<EventIndexingReadiness | null> {
  const results = await getEventsIndexingReadiness(supabase, [eventId]);
  return results.get(eventId) ?? null;
}

/**
 * Server-side bulk query for mutation callbacks and sitemap-adjacent jobs.
 * The caller controls chunking; keeping this bounded avoids PostgREST URL and
 * response-size surprises.
 */
export async function getEventsIndexingReadiness(
  supabase: SupabaseClient,
  eventIds: string[]
): Promise<Map<string, EventIndexingReadiness>> {
  const uniqueIds = [...new Set(eventIds)].slice(0, 100);
  if (uniqueIds.length === 0) return new Map();

  const { data: events, error: eventError } = await supabase
    .from("events")
    .select("id, slug, title, description, starts_at, ends_at, location_name, address, venue_id, is_online, online_link, image_url, tribe_id, tribe_visibility, source_locale, status, updated_at")
    .in("id", uniqueIds);

  if (eventError) {
    throw new Error(`[translation-readiness] event query failed: ${eventError.message}`);
  }
  if (!events?.length) return new Map();

  const { data: rows, error: translationError } = await supabase
    .from("content_translations")
    .select("content_id, target_locale, field_name, translated_text, updated_at")
    .eq("content_type", "event")
    .in("content_id", events.map((event) => event.id))
    .in("field_name", [...EVENT_INDEXABLE_TRANSLATION_FIELDS]);

  if (translationError) {
    throw new Error(`[translation-readiness] translation query failed: ${translationError.message}`);
  }

  return evaluateEventIndexingReadinessBatch(
    events as EventIndexingSource[],
    (rows ?? []) as EventIndexingTranslationRow[]
  );
}
