import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fetchSourceText, type FetchedSourceDocument } from "./fetch";
import { ingestVerifiedActivity } from "./ingest";
import type { ActivitySource, ExtractedActivity } from "./types";

const ISO_DATE_TIME = z.string().datetime({ offset: true }).or(z.null());

const sourceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  canonicalUrl: z.url().refine((value) => new URL(value).protocol === "https:", {
    message: "canonicalUrl must use HTTPS",
  }),
  discoveryUrl: z.url().refine((value) => new URL(value).protocol === "https:", {
    message: "discoveryUrl must use HTTPS",
  }),
  pagePathPrefix: z.string().trim().min(1).max(500).default("/"),
});

const evidenceSchema = z.object({
  fieldPath: z.string().trim().min(1).max(120),
  rawValue: z.unknown(),
  normalizedValue: z.unknown().optional(),
  evidenceText: z.string().trim().min(3).max(500),
  locator: z.string().trim().min(1).max(500),
  confidence: z.number().int().min(0).max(100),
  explicit: z.boolean().optional(),
});

const activitySchema = z.object({
  sourceUid: z.string().trim().min(1).max(1_000),
  sourceUrl: z.url().refine((value) => new URL(value).protocol === "https:", {
    message: "sourceUrl must use HTTPS",
  }),
  kind: z.enum([
    "event", "recurring_activity", "exhibition", "workshop", "class",
    "performance", "market", "religious_activity", "sports",
    "community_activity", "seasonal_activity", "bookable_experience", "other",
  ]),
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().max(8_000).nullable(),
  startsAt: ISO_DATE_TIME,
  endsAt: ISO_DATE_TIME,
  timePrecision: z.enum(["exact", "approximate", "date_only", "tba", "recurring"]),
  rrule: z.string().trim().max(500).nullable(),
  startsAtTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  firstOccurrence: z.string().date().nullable(),
  rruleUntil: ISO_DATE_TIME,
  locationName: z.string().trim().max(300).nullable(),
  address: z.string().trim().max(600).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  organizerName: z.string().trim().max(240).nullable(),
  organizerUrl: z.url().nullable(),
  priceType: z.enum(["free", "paid", "donation"]).nullable(),
  ticketTiers: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    price: z.number().min(0),
    currency: z.string().trim().min(3).max(8),
    description: z.string().trim().max(500).optional(),
  })).max(20).nullable(),
  ticketUrl: z.url().nullable(),
  reservationRequirement: z.enum(["not_required", "recommended", "required", "unknown"]).nullable(),
  publicAccess: z.literal("confirmed"),
  sourcePublishedAt: ISO_DATE_TIME,
  sourceUpdatedAt: ISO_DATE_TIME,
  eventStatus: z.enum(["scheduled", "cancelled", "postponed", "rescheduled", "unknown"]),
  evidence: z.array(evidenceSchema).min(4).max(40),
  structuredPayload: z.record(z.string(), z.unknown()).default({}),
  attributes: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])).default({}),
});

export const scoutSubmissionSchema = z.object({ source: sourceSchema, activity: activitySchema });
export type ScoutSubmission = z.infer<typeof scoutSubmissionSchema>;

const REQUIRED_EVIDENCE = ["title", "starts_at", "public_access"];
const PRIVATE_SOCIAL_HOSTS = [
  "facebook.com", "fb.com", "zalo.me", "whatsapp.com", "wa.me",
  "telegram.org", "t.me", "instagram.com", "tiktok.com",
];

function normalizePageText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
}

function sourceSlug(name: string, canonicalUrl: string): string {
  const host = new URL(canonicalUrl).hostname.replace(/^www\./, "");
  const base = `${name}-${host}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52) || "activity-source";
  const suffix = createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 8);
  return `${base}-${suffix}`;
}

function validateSubmissionRules(input: unknown, now: Date): ScoutSubmission {
  const submission = scoutSubmissionSchema.parse(input);
  const canonical = new URL(submission.source.canonicalUrl);
  const page = new URL(submission.activity.sourceUrl);
  const discovery = new URL(submission.source.discoveryUrl);
  if (
    PRIVATE_SOCIAL_HOSTS.some(
      (host) => canonical.hostname === host || canonical.hostname.endsWith(`.${host}`),
    )
  ) {
    throw new Error("Private or login-gated social sources cannot be submitted");
  }
  if (page.origin !== canonical.origin || discovery.origin !== canonical.origin) {
    throw new Error("Scout source and activity URLs must be canonical same-origin URLs");
  }
  if (!["scheduled", "rescheduled"].includes(submission.activity.eventStatus)) {
    throw new Error("Only scheduled or rescheduled activities can be submitted");
  }
  if (submission.activity.timePrecision !== "exact" || !submission.activity.startsAt) {
    throw new Error("Autonomous publication requires an exact future start time");
  }
  if (new Date(submission.activity.startsAt).getTime() <= now.getTime()) {
    throw new Error("Autonomous publication requires a future occurrence");
  }
  const fields = new Set(submission.activity.evidence.map((row) => row.fieldPath));
  for (const field of REQUIRED_EVIDENCE) {
    if (!fields.has(field)) throw new Error(`Missing required evidence: ${field}`);
  }
  if (!fields.has("address") && !fields.has("location_name")) {
    throw new Error("Missing required locality evidence");
  }
  return submission;
}

export function validateScoutSubmission(input: unknown, pageText: string, now: Date = new Date()): ScoutSubmission {
  const submission = validateSubmissionRules(input, now);
  const normalizedPage = normalizePageText(pageText);
  for (const row of submission.activity.evidence) {
    if (!normalizedPage.includes(normalizePageText(row.evidenceText))) {
      throw new Error(`Evidence is not present in the fetched source page: ${row.fieldPath}`);
    }
  }
  return submission;
}

function sourceRecord(submission: ScoutSubmission): Omit<ActivitySource, "id"> {
  return {
    slug: sourceSlug(submission.source.name, submission.source.canonicalUrl),
    name: submission.source.name,
    canonical_url: new URL(submission.source.canonicalUrl).origin,
    discovery_url: submission.source.discoveryUrl,
    page_path_prefix: submission.source.pagePathPrefix,
    source_kind: "first_party_venue",
    // The scheduled Codex scout refreshes these. The web cron skips this mode.
    fetch_mode: "manual",
    access_basis: "first_party_page",
    trust_tier: 1,
    policy_status: "approved",
    crawl_interval_minutes: 1440,
    max_items_per_run: 25,
    status: "active",
    auto_publish_enabled: true,
    auto_publish_threshold: 97,
    organizer_id: null,
    venue_id: null,
    metadata: {
      managed_by: "daily_activity_scout_v1",
      policy_note: "Autonomously admitted after canonical, same-origin, future schedule, explicit locality, public-access, and page-evidence checks.",
      media_policy: "reference_only",
      media_reuse_allowed: false,
    },
  };
}

async function resolveSource(supabase: SupabaseClient, submission: ScoutSubmission): Promise<ActivitySource> {
  const record = sourceRecord(submission);
  const { data: existing, error: existingError } = await supabase
    .from("activity_sources").select("*").eq("canonical_url", record.canonical_url).maybeSingle();
  if (existingError) throw new Error(`Source lookup failed: ${existingError.message}`);
  if (existing) {
    if (existing.fetch_mode !== "manual") return existing as ActivitySource;
    const { data, error } = await supabase
      .from("activity_sources")
      .update({ name: record.name, discovery_url: record.discovery_url, page_path_prefix: record.page_path_prefix,
        status: "active", policy_status: "approved", auto_publish_enabled: true, auto_publish_threshold: 97,
        next_check_at: new Date().toISOString() })
      .eq("id", existing.id).select("*").single();
    if (error || !data) throw new Error(`Source refresh failed: ${error?.message ?? "no source returned"}`);
    return data as ActivitySource;
  }
  const { data, error } = await supabase
    .from("activity_sources").insert({ ...record, next_check_at: new Date().toISOString() }).select("*").single();
  if (error || !data) throw new Error(`Source admission failed: ${error?.message ?? "no source returned"}`);
  return data as ActivitySource;
}

export interface ScoutSubmissionResult {
  sourceId: string;
  sourceSlug: string;
  title: string;
  decision: string | null;
  published: boolean;
}

export async function ingestScoutSubmission(supabase: SupabaseClient, input: unknown, now: Date = new Date()): Promise<ScoutSubmissionResult> {
  // Fetch before creating any database row. A scout cannot use an unreachable,
  // cross-origin, or private-network page as evidence.
  const preliminary = validateSubmissionRules(input, now);
  const provisional = sourceRecord(preliminary) as ActivitySource & { id: string };
  const document: FetchedSourceDocument = await fetchSourceText(
    { ...provisional, id: "00000000-0000-4000-8000-000000000000" },
    preliminary.activity.sourceUrl,
    { timeoutMs: 15_000 },
  );
  const submission = validateScoutSubmission(input, document.text, now);
  const source = await resolveSource(supabase, submission);
  const processed = await ingestVerifiedActivity(
    supabase, source, { ...submission.activity, timezone: "Asia/Ho_Chi_Minh" } as ExtractedActivity, document, now,
  );
  const { error } = await supabase.from("activity_sources").update({
    last_checked_at: now.toISOString(), last_success_at: now.toISOString(), consecutive_failures: 0,
    error_detail: null, last_error_at: null, next_check_at: new Date(now.getTime() + 86_400_000).toISOString(),
  }).eq("id", source.id);
  if (error) throw new Error(`Source health update failed: ${error.message}`);
  return {
    sourceId: source.id, sourceSlug: source.slug, title: submission.activity.title,
    decision: processed.projection?.decision ?? null, published: processed.projection?.status === "published",
  };
}
