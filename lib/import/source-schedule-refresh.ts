import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSourceText } from "@/lib/activity-graph/fetch";
import { extractSchemaOrgEvents } from "@/lib/activity-graph/parsers";
import {
  rewriteDateMentions,
  rewriteSlugDate,
  scheduleChanged,
  withScheduleChangeLog,
} from "@/lib/activity-graph/schedule-change";
import type {
  ActivitySource,
  ExtractedActivity,
} from "@/lib/activity-graph/types";
import { TRANSLATION_NEEDED_AT_KEY } from "@/lib/translation-sweep";
import { canonicalizeSourceUrl } from "./safe-url";

/**
 * Daily re-check of published, upcoming, non-series events whose source is a
 * structured ticketing/venue page (schema.org Event JSON-LD: Mây Lang Thang,
 * Nextix, Ticketbox, TicketGo, ...). Activity-graph events are skipped; that
 * sync already refreshes them hourly.
 *
 * Safety: a fetch error, missing/ambiguous structured data, a non-exact time,
 * or a new date in the past never changes the event and never unpublishes it.
 */

const LOOKAHEAD_DAYS = 180;
const DEFAULT_LIMIT = 80;
const DETECTOR = "source-schedule-refresh";
// Hosts that never carry schema.org Event data for a single show.
const UNSTRUCTURED_HOSTS =
  /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|zalo\.me|t\.me|wa\.me|whatsapp\.com|tiktok\.com|youtube\.com|youtu\.be|goo\.gl|google\.com|x\.com|twitter\.com|threads\.net)$/i;

export interface RefreshableEvent {
  id: string;
  slug: string | null;
  title: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  external_chat_url: string | null;
  source_metadata: Record<string, unknown> | null;
}

export type RefreshOutcome =
  | { eventId: string; status: "unchanged" }
  | { eventId: string; status: "skipped"; reason: string }
  | { eventId: string; status: "error"; reason: string }
  | {
      eventId: string;
      status: "updated";
      from: string;
      to: string;
      slug: string | null;
    };

export function refreshSourceUrl(event: RefreshableEvent): string | null {
  const metadataUrl = event.source_metadata?.source_url;
  const candidates = [
    typeof metadataUrl === "string" ? metadataUrl : null,
    event.external_chat_url,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const canonical = canonicalizeSourceUrl(candidate);
    if (!canonical) continue;
    const url = new URL(canonical);
    if (url.protocol !== "https:") continue;
    if (UNSTRUCTURED_HOSTS.test(url.hostname)) continue;
    return canonical;
  }
  return null;
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Choose the one structured occurrence that describes this event. */
export function pickSourceOccurrence(
  activities: ExtractedActivity[],
  pageUrl: string,
  title: string | null,
): ExtractedActivity | null {
  if (activities.length === 0) return null;
  if (activities.length === 1) return activities[0];
  const page = canonicalizeSourceUrl(pageUrl);
  const byUrl = activities.filter(
    (activity) => canonicalizeSourceUrl(activity.sourceUrl) === page,
  );
  if (byUrl.length === 1) return byUrl[0];
  const wanted = normalizeTitle(title);
  const byTitle = (byUrl.length ? byUrl : activities).filter(
    (activity) => normalizeTitle(activity.title) === wanted,
  );
  return byTitle.length === 1 ? byTitle[0] : null;
}

export interface PlannedScheduleUpdate {
  startsAt: string;
  endsAt: string | null;
  title: string | null;
  description: string | null;
  slug: string | null;
}

/** Decide whether and how to move a published event to the source schedule. */
export function planScheduleUpdate(
  event: RefreshableEvent,
  occurrence: ExtractedActivity,
  now: Date,
): PlannedScheduleUpdate | { skip: string } | null {
  if (occurrence.timePrecision !== "exact" || !occurrence.startsAt) {
    return { skip: `source time precision ${occurrence.timePrecision}` };
  }
  const newStartMs = new Date(occurrence.startsAt).getTime();
  if (Number.isNaN(newStartMs)) return { skip: "unparseable source start" };
  if (
    occurrence.eventStatus === "cancelled" ||
    occurrence.eventStatus === "postponed"
  ) {
    // Left for a human: never auto-unpublish from a refresh.
    return { skip: `source eventStatus ${occurrence.eventStatus}` };
  }
  let endsAt = occurrence.endsAt;
  if (!endsAt && event.ends_at) {
    const duration =
      new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime();
    if (duration > 0) endsAt = new Date(newStartMs + duration).toISOString();
  }
  if (
    !scheduleChanged(
      { startsAt: event.starts_at, endsAt: event.ends_at },
      { startsAt: occurrence.startsAt, endsAt },
    )
  ) {
    return null;
  }
  if (newStartMs <= now.getTime()) {
    return { skip: "source start is in the past" };
  }
  if (newStartMs > now.getTime() + 400 * 86_400_000) {
    return { skip: "source start is implausibly far out" };
  }
  if (endsAt && new Date(endsAt).getTime() < newStartMs) {
    return { skip: "source end precedes start" };
  }
  const startsAt = new Date(newStartMs).toISOString();
  return {
    startsAt,
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    title: event.title
      ? rewriteDateMentions(event.title, event.starts_at, startsAt)
      : event.title,
    description: event.description
      ? rewriteDateMentions(event.description, event.starts_at, startsAt)
      : event.description,
    slug: event.slug
      ? rewriteSlugDate(event.slug, event.starts_at, startsAt)
      : null,
  };
}

async function defaultFetchHtml(
  url: string,
): Promise<{ text: string; url: string }> {
  const origin = new URL(url).origin;
  const document = await fetchSourceText(
    { canonical_url: origin } as ActivitySource,
    url,
    { timeoutMs: 12_000 },
  );
  return { text: document.text, url: document.url };
}

export async function refreshPublishedSourceSchedules(
  supabase: SupabaseClient,
  options: {
    now?: Date;
    limit?: number;
    deadlineMs?: number;
    fetchHtml?: (url: string) => Promise<{ text: string; url: string }>;
  } = {},
): Promise<RefreshOutcome[]> {
  const now = options.now ?? new Date();
  const fetchHtml = options.fetchHtml ?? defaultFetchHtml;
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000);
  const { data, error } = await supabase
    .from("events")
    .select(
      "id,slug,title,description,starts_at,ends_at,status,external_chat_url,source_metadata",
    )
    .eq("status", "published")
    .is("series_id", null)
    .or("source_platform.is.null,source_platform.neq.activity-graph")
    .gt("starts_at", now.toISOString())
    .lt("starts_at", horizon.toISOString())
    .order("starts_at", { ascending: true })
    .limit(options.limit ?? DEFAULT_LIMIT);
  if (error)
    throw new Error(`Refresh candidate query failed: ${error.message}`);

  const outcomes: RefreshOutcome[] = [];
  for (const event of (data ?? []) as RefreshableEvent[]) {
    if (options.deadlineMs && Date.now() > options.deadlineMs) break;
    const sourceUrl = refreshSourceUrl(event);
    if (!sourceUrl) continue;
    let occurrence: ExtractedActivity | null;
    try {
      const page = await fetchHtml(sourceUrl);
      occurrence = pickSourceOccurrence(
        extractSchemaOrgEvents(page.text, page.url),
        page.url,
        event.title,
      );
    } catch (fetchError) {
      // Never unpublish or edit on a fetch failure.
      outcomes.push({
        eventId: event.id,
        status: "error",
        reason:
          fetchError instanceof Error ? fetchError.message : String(fetchError),
      });
      continue;
    }
    if (!occurrence) {
      outcomes.push({
        eventId: event.id,
        status: "skipped",
        reason: "no unambiguous schema.org Event",
      });
      continue;
    }
    const plan = planScheduleUpdate(event, occurrence, now);
    if (!plan) {
      outcomes.push({ eventId: event.id, status: "unchanged" });
      continue;
    }
    if ("skip" in plan) {
      outcomes.push({
        eventId: event.id,
        status: "skipped",
        reason: plan.skip,
      });
      continue;
    }
    const detectedAt = now.toISOString();
    const metadata = {
      ...withScheduleChangeLog(event.source_metadata ?? {}, {
        from: { startsAt: event.starts_at, endsAt: event.ends_at },
        to: { startsAt: plan.startsAt, endsAt: plan.endsAt },
        detectedAt,
        sourceUrl,
        detector: DETECTOR,
      }),
      [TRANSLATION_NEEDED_AT_KEY]: detectedAt,
    };
    const update: Record<string, unknown> = {
      starts_at: plan.startsAt,
      ends_at: plan.endsAt,
      title: plan.title,
      description: plan.description,
      source_metadata: metadata,
    };
    if (plan.slug) update.slug = plan.slug;
    const write = (values: Record<string, unknown>) =>
      supabase
        .from("events")
        .update(values)
        .eq("id", event.id)
        .eq("status", "published")
        .eq("starts_at", event.starts_at)
        .select("id")
        .maybeSingle();
    let result = await write(update);
    let slugWritten = Boolean(plan.slug);
    if (result.error && plan.slug) {
      // Slug collision or similar: move the date anyway, keep the slug.
      delete update.slug;
      slugWritten = false;
      result = await write(update);
    }
    if (result.error || !result.data) {
      outcomes.push({
        eventId: event.id,
        status: "error",
        reason:
          result.error?.message ?? "event changed concurrently; not updated",
      });
      continue;
    }
    const { error: deleteError } = await supabase
      .from("content_translations")
      .delete()
      .eq("content_type", "event")
      .eq("content_id", event.id);
    if (deleteError) {
      console.warn(
        "[source-schedule-refresh] translation reset failed",
        event.id,
        deleteError.message,
      );
    }
    console.info("[source-schedule-refresh] published event schedule changed", {
      eventId: event.id,
      from: event.starts_at,
      to: plan.startsAt,
    });
    outcomes.push({
      eventId: event.id,
      status: "updated",
      from: event.starts_at,
      to: plan.startsAt,
      slug: slugWritten ? plan.slug : null,
    });
  }
  return outcomes;
}
