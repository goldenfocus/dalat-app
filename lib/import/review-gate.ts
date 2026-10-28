import type { SupabaseClient } from "@supabase/supabase-js";
import { triggerTranslationServer } from "@/lib/translations";
import {
  evaluateEventIndexingReadiness,
  type EventIndexingSource,
  type EventIndexingTranslationRow,
} from "@/lib/translations-readiness";
import { CONTENT_LOCALES } from "@/lib/types";
import { isDuplicateOf, isSeriesInstanceDuplicate } from "./duplicate-key";
import { evaluateDiscoveryHorizon } from "./horizon";
import { eventLooksLocalToDalat } from "./locality";
import { isPersistedSourceRef } from "./safe-url";
import { resolveStoredSourceLocale } from "./source-locale";

export type ReviewReasonCode =
  | "missing_title"
  | "missing_start"
  | "missing_location"
  | "missing_source"
  | "missing_description"
  | "past_event"
  | "beyond_horizon"
  | "not_dalat_locality"
  | "duplicate_published"
  | "missing_image"
  | "missing_promo"
  | "activity_graph_lane"
  | "missing_source_text"
  | "inferred_time"
  | "time_text_mismatch"
  | "title_sentence_like"
  | "title_schedule_line"
  | "personal_photo_hero"
  | "not_a_draft"
  | "not_found";

export interface ReviewReason {
  code: ReviewReasonCode;
  message: string;
}

export interface ReviewEventSnapshot {
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
  image_alt: string | null;
  external_chat_url: string | null;
  tribe_id: string | null;
  tribe_visibility: string | null;
  source_locale: string | null;
  source_platform: string | null;
  source_metadata: Record<string, unknown> | null;
  status: string;
  updated_at: string;
}

export interface EvaluateResult {
  passed: boolean;
  reasons: ReviewReason[];
  event: { id: string; slug: string; status: string };
}

export interface PublishResult extends EvaluateResult {
  published: boolean;
}

export interface RejectResult {
  rejected: boolean;
  reasons: Array<{ message: string; code?: ReviewReasonCode }>;
  event: { id: string; slug: string; status: string };
}

export interface TranslationGap {
  locale: string;
  missingFields: string[];
  nonSubstantiveFields: string[];
}

export interface ImageQaGap {
  code:
    | "missing_hero"
    | "missing_promo"
    | "missing_ai_disclosure"
    | "documented_visual_gap";
  message: string;
}

export interface QaResult {
  passed: boolean;
  event: { id: string; slug: string; status: string };
  translations: {
    passed: boolean;
    readyLocales: string[];
    missingLocales: string[];
    gaps: TranslationGap[];
  };
  images: {
    passed: boolean;
    heroPresent: boolean;
    promoCount: number;
    gaps: ImageQaGap[];
  };
}

const EVENT_SELECT =
  "id, slug, title, description, starts_at, ends_at, location_name, address, venue_id, is_online, online_link, image_url, image_alt, external_chat_url, tribe_id, tribe_visibility, source_locale, source_platform, source_metadata, status, updated_at";

export async function loadReviewEvent(
  supabase: SupabaseClient,
  lookup: { id?: string; slug?: string },
): Promise<ReviewEventSnapshot | null> {
  let query = supabase.from("events").select(EVENT_SELECT);
  if (lookup.id) query = query.eq("id", lookup.id);
  else if (lookup.slug) query = query.eq("slug", lookup.slug);
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Event lookup failed: ${error.message}`);
  return (data as ReviewEventSnapshot | null) ?? null;
}

export function evaluateDraftQuality(
  event: ReviewEventSnapshot,
  options: { publishedDuplicate: boolean; now?: Date; promoCount?: number },
): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (event.source_platform === "activity-graph") {
    reasons.push({
      code: "activity_graph_lane",
      message: "Activity Graph listings are not reviewed through this gate",
    });
    return reasons;
  }
  if (!event.title?.trim() || event.title.trim().length < 3) {
    reasons.push({
      code: "missing_title",
      message: "Title is missing or too short",
    });
  }
  if (!event.description?.trim()) {
    reasons.push({
      code: "missing_description",
      message: "Description (canonical source facts) is required",
    });
  }
  if (!event.starts_at) {
    reasons.push({ code: "missing_start", message: "starts_at is required" });
  } else {
    const horizon = evaluateDiscoveryHorizon(
      new Date(event.starts_at),
      options.now,
    );
    if (!horizon.ok) {
      reasons.push({
        code: horizon.code,
        message:
          horizon.code === "past_event"
            ? "Event starts in the past"
            : "Event is more than 45 days out",
      });
    }
  }
  if (!event.location_name?.trim() && !event.venue_id) {
    reasons.push({
      code: "missing_location",
      message: "Venue / location_name is required",
    });
  }
  const sourceRef =
    (typeof event.source_metadata?.source_url === "string"
      ? event.source_metadata.source_url
      : null) ?? event.external_chat_url;
  const whatsappProvenance =
    event.source_platform === "whatsapp" &&
    typeof event.source_metadata?.message_id === "string";
  if (!isPersistedSourceRef(sourceRef) && !whatsappProvenance) {
    reasons.push({
      code: "missing_source",
      message: "source_url / WhatsApp message provenance is required",
    });
  }
  if (
    !eventLooksLocalToDalat(
      event.title,
      event.description,
      event.location_name,
      event.address,
    )
  ) {
    reasons.push({
      code: "not_dalat_locality",
      message: "No Đà Lạt / Lâm Đồng locality evidence in the stored facts",
    });
  }
  if (options.publishedDuplicate) {
    reasons.push({
      code: "duplicate_published",
      message:
        "A published event (or recurring-series instance at the same venue and slot) already exists for this date",
    });
  }
  const heroPresent = Boolean(event.image_url?.trim());
  const promoCount = options.promoCount ?? 0;
  // visual_gap may only waive missing_promo, and only when a hero exists.
  // A documented gap that covers "hero" never waives a missing image_url.
  const promoCoveredByGap =
    heroPresent &&
    visualGapCoversPromo(event.source_metadata) &&
    promoCount < 2;
  if (!heroPresent) {
    reasons.push({
      code: "missing_image",
      message: "Hero image is missing",
    });
  }
  if ((promoCount < 2 || promoCount > 4) && !promoCoveredByGap) {
    reasons.push({
      code: "missing_promo",
      message: `Promo gallery has ${promoCount} image(s); visual-truth requires 2–4 distinct images, or a documented visual_gap covering promo when a hero exists`,
    });
  }
  if (event.source_platform === "whatsapp") {
    reasons.push(...evaluateWhatsAppDraftEvidence(event));
  }
  return reasons;
}

/** WhatsApp drafts must carry real source text and literal times — never invented flyer vision. */
export function evaluateWhatsAppDraftEvidence(
  event: ReviewEventSnapshot,
): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  const meta = event.source_metadata ?? {};
  if (!whatsappHasSourceTextEvidence(event)) {
    reasons.push({
      code: "missing_source_text",
      message: "WhatsApp draft has no caption or readable flyer text evidence",
    });
  }
  if (meta.time_inferred === true) {
    reasons.push({
      code: "inferred_time",
      message:
        "WhatsApp draft time was inferred, not read from the caption or flyer text",
    });
  }
  if (
    meta.title_needs_review === true ||
    isChatSentenceTitle(event.title ?? "")
  ) {
    reasons.push({
      code: "title_sentence_like",
      message:
        "Title is a chat sentence or a placeholder, not the event's name; use the flyer/series name",
    });
  }
  if (isScheduleLine(event.title ?? "")) {
    reasons.push({
      code: "title_schedule_line",
      message:
        "Title is a schedule/agenda line (time slot + activity), not the event's name; use the flyer/series name",
    });
  }
  if (
    meta.time_inferred !== true &&
    event.starts_at &&
    whatsappPmTimeMismatch(event.starts_at, meta.source_text_evidence)
  ) {
    reasons.push({
      code: "time_text_mismatch",
      message:
        "Source text gives PM times, but the stored start time matches none of the times in the text",
    });
  }
  if (
    meta.personal_photo_hero === true ||
    meta.image_kind === "photo_of_people" ||
    (meta.is_event_flyer === false &&
      meta.extraction === "vision" &&
      Boolean(event.image_url?.trim()))
  ) {
    reasons.push({
      code: "personal_photo_hero",
      message:
        "Hero looks like a personal photo of people or scenery, not an organizer flyer",
    });
  }
  return reasons;
}

const CHAT_CLAUSE_CUES = [
  "which means",
  "it's time",
  "it is time",
  "coming soon",
  "don't miss",
  "dont miss",
  "do not miss",
  "join us",
  "see you",
  "thank you",
  "thanks for",
  "looking forward",
  "can't wait",
  "cant wait",
  "we'll",
  "we will",
  "i'll",
  "i will",
  "i'd",
  "i'm ",
  "we're",
  "hope to",
  "hope you",
  "dm me",
  "message me",
  "let us know",
];
const DANGLING_END = new Set([
  "and",
  "or",
  "but",
  "so",
  "to",
  "some",
  "the",
  "a",
  "an",
  "of",
  "with",
  "for",
  "which",
  "that",
  "because",
  "if",
  "my",
  "your",
  "our",
  "their",
  "is",
  "are",
  "will",
  "was",
  "were",
  "be",
  "it",
  "we",
  "you",
  "i",
  "very",
  "really",
  "as",
  "than",
  "và",
  "hoặc",
  "nhưng",
  "của",
  "để",
  "với",
]);

const SCHED_TIME = String.raw`(?:\d{1,2}(?:[:.h]\d{2})\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?|\d{1,2}h(?:\d{2})?|\d{1,2}\s*giờ(?:\s*\d{2})?)`;
const SCHED_RANGE = String.raw`(?:${SCHED_TIME}|\d{1,2})\s*(?:[-–—~]|to|until|đến)\s*${SCHED_TIME}`;
const SCHED_SEP = String.raw`\s*(?:[-–—:•·|>→»]|onwards?\s*[-–—:•]?|trở đi\s*[-–—:•]?)\s*`;
const SCHEDULE_SEP_RE = new RegExp(
  String.raw`(?:^|[\s(])(?:from\s+|từ\s+)?(?:${SCHED_RANGE}|${SCHED_TIME})(?:\s*(?:onwards?|trở đi))?${SCHED_SEP}\p{L}`,
  "iu",
);
const SCHEDULE_LEAD_RE = new RegExp(
  String.raw`^(?:from\s+|từ\s+)?(?:${SCHED_RANGE}|${SCHED_TIME})\s+\p{L}`,
  "iu",
);

/**
 * Mirrors whatsapp-ingest isScheduleLine: "💃 6:30–7:30 PM — Dance class",
 * "18h-19h: Yoga", "7:30 PM onwards — Social dancing" are agenda slots.
 */
export function isScheduleLine(title: string): boolean {
  const core = title
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\p{Extended_Pictographic}|\ufe0f/gu, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
  if (!core) return false;
  return SCHEDULE_SEP_RE.test(core) || SCHEDULE_LEAD_RE.test(core);
}

/**
 * Mirrors whatsapp-ingest isChatSentenceTitle: "Sunday is coming soon, which
 * means it's time to rustle some", "Looking forward to seeing everyone tomorrow!".
 */
export function isChatSentenceTitle(title: string): boolean {
  const core = title
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\p{Extended_Pictographic}|\ufe0f/gu, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
  if (!core) return false;
  const low = core.toLowerCase().replace(/[’‘]/g, "'");
  if (CHAT_CLAUSE_CUES.some((cue) => low.includes(cue))) return true;
  if (
    /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|this weekend|the weekend)('s|\s+is)\b/.test(
      low,
    )
  ) {
    return true;
  }
  const words = core.split(/\s+/);
  const vi = (
    core.match(
      /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/giu,
    ) ?? []
  ).length;
  const letters = (core.match(/\p{L}/gu) ?? []).length || 1;
  const limit = vi / letters >= 0.15 ? 14 : 8;
  if (
    words.length > limit &&
    !/[|:–—]/.test(core) &&
    (/[,.!?;]/.test(core) ||
      /(^|[^\p{L}'])(i|we|us|you|my|our|your|it's|they|everyone)([^\p{L}']|$)/u.test(
        low,
      ))
  ) {
    return true;
  }
  if (/[,;]$/.test(core)) return true;
  const last = words[words.length - 1]
    .toLowerCase()
    .replace(/^[.,;:!?'"’…]+|[.,;:!?'"’…]+$/g, "");
  return words.length >= 3 && DANGLING_END.has(last);
}

/**
 * True when the source text states PM times but the stored start (in Đà Lạt
 * time, UTC+7) matches none of the clock hours written in that text, e.g.
 * "DJs 6–10 PM" stored as 13:00.
 */
export function whatsappPmTimeMismatch(
  startsAt: string,
  evidence: unknown,
): boolean {
  if (typeof evidence !== "string" || !evidence.trim()) return false;
  const text = evidence.toLowerCase();
  if (!/\d\s*(?:pm|p\.m\.)/.test(text)) return false;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  const localHour = (start.getUTCHours() + 7) % 24;

  const hours = new Set<number>();
  const to24 = (h: number, mer: string) =>
    mer.startsWith("p") ? (h % 12) + 12 : mer.startsWith("a") ? h % 12 : h;
  const mer = "(am|pm|a\\.m\\.|p\\.m\\.)";
  for (const m of text.matchAll(
    new RegExp(
      `(?<!(?:buy|get|mua|tặng)\\s*)(?<!\\d)(\\d{1,2})(?::\\d{2})?\\s*${mer}?\\s*(?:-|–|—|~|to|until|till)\\s*(\\d{1,2})(?::\\d{2})?\\s*${mer}(?!\\s*(?:-|–|—|~|to|until|till)\\s*\\d)`,
      "g",
    ),
  )) {
    const startMer = m[2] ?? m[4];
    hours.add(to24(Number(m[1]), startMer));
    hours.add(to24(Number(m[3]), m[4]));
  }
  for (const m of text.matchAll(
    new RegExp(`(\\d{1,2})(?::\\d{2})?\\s*${mer}`, "g"),
  )) {
    hours.add(to24(Number(m[1]), m[2]));
  }
  for (const m of text.matchAll(
    /(?<![\d/.])(\d{1,2})(?::\d{2}|h\d{0,2})(?![\d])/g,
  )) {
    const h = Number(m[1]);
    if (h <= 23) hours.add(h);
  }
  return hours.size > 0 && !hours.has(localHour);
}

export function whatsappHasSourceTextEvidence(
  event: ReviewEventSnapshot,
): boolean {
  const meta = event.source_metadata ?? {};
  for (const key of [
    "source_text_evidence",
    "readable_text",
    "caption",
  ] as const) {
    const value = meta[key];
    if (
      typeof value === "string" &&
      value.trim().length >= 3 &&
      !isCommunityAttribution(value)
    ) {
      return true;
    }
  }
  const description = (event.description ?? "").trim();
  if (!description) return false;
  const withoutCommunity = description
    .replace(
      /\n\nShared in the "[^"]+" WhatsApp group of the Life in Đà Lạt community\.?\s*$/u,
      "",
    )
    .trim();
  if (!withoutCommunity || isCommunityAttribution(withoutCommunity)) {
    return false;
  }
  return withoutCommunity.length >= 3;
}

function isCommunityAttribution(text: string): boolean {
  return /^Shared in the ".+" WhatsApp group of the Life in Đà Lạt community\.?$/u.test(
    text.trim(),
  );
}

export async function evaluateReviewEvent(
  supabase: SupabaseClient,
  event: ReviewEventSnapshot,
  options: { now?: Date } = {},
): Promise<EvaluateResult> {
  const publishedDuplicate = await hasPublishedDuplicate(supabase, event);
  const promoCount = await countPromoMedia(supabase, event.id);
  const reasons = evaluateDraftQuality(event, {
    publishedDuplicate,
    now: options.now,
    promoCount,
  });
  return {
    passed: reasons.length === 0,
    reasons,
    event: { id: event.id, slug: event.slug, status: event.status },
  };
}

export async function publishReviewEvent(
  supabase: SupabaseClient,
  event: ReviewEventSnapshot,
  options: { now?: Date } = {},
): Promise<PublishResult> {
  if (event.status !== "draft") {
    return {
      passed: false,
      published: false,
      reasons: [
        {
          code: "not_a_draft",
          message: `Event status is ${event.status}, not draft`,
        },
      ],
      event: { id: event.id, slug: event.slug, status: event.status },
    };
  }

  const evaluation = await evaluateReviewEvent(supabase, event, options);
  if (!evaluation.passed) {
    return { ...evaluation, published: false };
  }

  const reviewedAt = (options.now ?? new Date()).toISOString();
  const metadata = {
    ...(event.source_metadata ?? {}),
    needs_review: false,
    reviewed_at: reviewedAt,
    review_result: "published",
    // Durable sweep signal: Mac mini collectTranslationWork always loads
    // published rows with translation_needed_at, even during a blog-failure
    // loop or when SCAN_LIMIT / created_at would miss this id.
    translation_needed_at: reviewedAt,
  };

  // Persist a real source_locale when a cheap script hint can set one.
  // Null source_locale blocks every locale in Review QA / indexing readiness.
  // Bump updated_at so lib/translation-sweep's published-by-updated_at query
  // cannot miss a draft whose created_at is older than SCAN_LIMIT.
  const sourceLocale = resolveStoredSourceLocale(
    event.source_locale,
    event.title,
    event.description,
  );
  const { error } = await supabase
    .from("events")
    .update({
      status: "published",
      source_metadata: metadata,
      updated_at: reviewedAt,
      ...(sourceLocale ? { source_locale: sourceLocale } : {}),
    })
    .eq("id", event.id)
    .eq("status", "draft");

  if (error) {
    throw new Error(`Publish failed: ${error.message}`);
  }

  // Schedules Vercel after() translation for this event. The durable retry is
  // source_metadata.translation_needed_at, drained by /api/cron/translate-events.
  // Do not also trigger on scout draft ingest — WhatsApp/scout drafts share
  // this publish hook. Review never writes locale strings itself.
  await queuePublishedEventTranslation(event);

  return {
    passed: true,
    published: true,
    reasons: [],
    event: { id: event.id, slug: event.slug, status: "published" },
  };
}

function queuePublishedEventTranslation(event: ReviewEventSnapshot) {
  const fieldsToTranslate: {
    field_name: "title" | "description";
    text: string;
  }[] = [];
  if (event.title?.trim()) {
    fieldsToTranslate.push({ field_name: "title", text: event.title });
  }
  if (event.description?.trim()) {
    fieldsToTranslate.push({
      field_name: "description",
      text: event.description,
    });
  }
  if (fieldsToTranslate.length === 0) {
    return Promise.resolve({ ok: true, localesWritten: 0 });
  }
  return triggerTranslationServer("event", event.id, fieldsToTranslate);
}

export async function rejectReviewEvent(
  supabase: SupabaseClient,
  event: ReviewEventSnapshot,
  reasons: string[],
  options: { now?: Date } = {},
): Promise<RejectResult> {
  const cleaned = reasons.map((reason) => reason.trim()).filter(Boolean);
  if (event.status !== "draft") {
    return {
      rejected: false,
      reasons: [
        {
          code: "not_a_draft",
          message: `Event status is ${event.status}, not draft`,
        },
      ],
      event: { id: event.id, slug: event.slug, status: event.status },
    };
  }

  const rejectedAt = (options.now ?? new Date()).toISOString();
  const metadata = {
    ...(event.source_metadata ?? {}),
    needs_review: false,
    review_result: "rejected",
    rejected_at: rejectedAt,
    reject_reasons: cleaned,
  };
  const { error } = await supabase
    .from("events")
    .update({
      source_metadata: metadata,
      updated_at: rejectedAt,
    })
    .eq("id", event.id)
    .eq("status", "draft");

  if (error) {
    throw new Error(`Reject failed: ${error.message}`);
  }

  return {
    rejected: true,
    reasons: cleaned.map((message) => ({ message })),
    event: { id: event.id, slug: event.slug, status: "draft" },
  };
}

export function isDocumentedVisualGap(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const visualGap = metadata?.visual_gap;
  return Boolean(
    visualGap &&
    typeof visualGap === "object" &&
    "reason" in visualGap &&
    typeof (visualGap as { reason?: unknown }).reason === "string",
  );
}

export function visualGapCoversPromo(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!isDocumentedVisualGap(metadata)) return false;
  const visualGap = metadata?.visual_gap as {
    covers?: unknown;
    reason?: unknown;
  };
  if (!Array.isArray(visualGap.covers)) {
    // Legacy visual_gap objects documented a general visual shortfall.
    return true;
  }
  return visualGap.covers.includes("promo");
}

async function countPromoMedia(
  supabase: SupabaseClient,
  eventId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("promo_media")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (error) {
    throw new Error(`Promo count failed: ${error.message}`);
  }
  return count ?? 0;
}

export async function qaReviewEvent(
  supabase: SupabaseClient,
  event: ReviewEventSnapshot,
): Promise<QaResult> {
  const { data: translationRows, error: translationError } = await supabase
    .from("content_translations")
    .select(
      "content_id, target_locale, field_name, translated_text, updated_at",
    )
    .eq("content_type", "event")
    .eq("content_id", event.id)
    .in("field_name", ["title", "description"]);
  if (translationError) {
    throw new Error(`Translation query failed: ${translationError.message}`);
  }

  const readiness = evaluateEventIndexingReadiness(
    event as EventIndexingSource,
    (translationRows ?? []) as EventIndexingTranslationRow[],
  );

  const gaps: TranslationGap[] = readiness.locales
    .filter((locale) => !locale.isSourceLocale && !locale.translationReady)
    .map((locale) => ({
      locale: locale.locale,
      missingFields: locale.missingFields,
      nonSubstantiveFields: locale.nonSubstantiveFields,
    }));

  const sourceLocale = readiness.sourceLocale;
  const expectedLocales = CONTENT_LOCALES.filter(
    (locale) => locale !== sourceLocale,
  );
  const readyTranslated = readiness.locales
    .filter((locale) => !locale.isSourceLocale && locale.translationReady)
    .map((locale) => locale.locale);

  const { data: promo, error: promoError } = await supabase
    .from("promo_media")
    .select("id, media_url, title, caption, is_ai_suggested")
    .eq("event_id", event.id);
  if (promoError) {
    throw new Error(`Promo query failed: ${promoError.message}`);
  }

  const promoRows = promo ?? [];
  const imageGaps: ImageQaGap[] = [];
  const heroPresent = Boolean(event.image_url?.trim());
  const documentedGap = isDocumentedVisualGap(event.source_metadata);
  const promoCoveredByGap =
    heroPresent &&
    visualGapCoversPromo(event.source_metadata) &&
    promoRows.length < 2;
  if (!heroPresent) {
    imageGaps.push({
      code: "missing_hero",
      message: "Published event is missing a hero image",
    });
  }
  if ((promoRows.length < 2 || promoRows.length > 4) && !promoCoveredByGap) {
    imageGaps.push({
      code: "missing_promo",
      message: `Promo gallery has ${promoRows.length} image(s); visual-truth requires 2–4`,
    });
  }
  if (documentedGap && !heroPresent) {
    imageGaps.push({
      code: "documented_visual_gap",
      message: "A visual gap was documented at ingest — still unresolved",
    });
  }
  const aiHero = /ai[- ]generated/i.test(event.image_alt ?? "");
  const metadataProvenance = event.source_metadata?.visual_provenance;
  if (metadataProvenance === "ai_generated" && !aiHero) {
    imageGaps.push({
      code: "missing_ai_disclosure",
      message: "AI-generated hero is not disclosed in image_alt",
    });
  }
  for (const row of promoRows) {
    if (
      row.is_ai_suggested &&
      !/ai[- ]generated/i.test(`${row.title ?? ""} ${row.caption ?? ""}`)
    ) {
      imageGaps.push({
        code: "missing_ai_disclosure",
        message: `Promo ${row.id} is marked AI-generated without disclosure`,
      });
    }
  }

  const translationsPassed =
    gaps.length === 0 && expectedLocales.length === readyTranslated.length;
  const imagesPassed = imageGaps.length === 0;

  return {
    passed: translationsPassed && imagesPassed,
    event: { id: event.id, slug: event.slug, status: event.status },
    translations: {
      passed: translationsPassed,
      readyLocales: readyTranslated,
      missingLocales: expectedLocales.filter(
        (locale) => !readyTranslated.includes(locale),
      ),
      gaps,
    },
    images: {
      passed: imagesPassed,
      heroPresent,
      promoCount: promoRows.length,
      gaps: imageGaps,
    },
  };
}

async function hasPublishedDuplicate(
  supabase: SupabaseClient,
  event: ReviewEventSnapshot,
): Promise<boolean> {
  const day = event.starts_at?.slice(0, 10);
  if (!day || !event.title) return false;
  // Widen by a day each side: starts_at is UTC and a Đà Lạt evening can sit
  // on either UTC date. isDuplicateOf does the real matching.
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, starts_at, ends_at, series_id, venue_id, location_name, venue:venues(name)",
    )
    .eq("status", "published")
    .neq("id", event.id)
    .gte("starts_at", prevDay(day))
    .lt("starts_at", nextDay(nextDay(day)))
    .limit(200);
  if (error) {
    console.error("[review-gate] duplicate lookup failed", error);
    return false;
  }
  const self = {
    id: event.id,
    title: event.title,
    starts_at: event.starts_at,
    ends_at: event.ends_at ?? null,
    venue_id: event.venue_id ?? null,
    location_name: event.location_name ?? null,
  };
  return (data ?? []).some((row) => {
    const venue = (row as { venue?: { name?: string | null } | null }).venue;
    const other = {
      ...(row as Record<string, unknown>),
      venue_name: venue?.name ?? null,
    } as Parameters<typeof isSeriesInstanceDuplicate>[1];
    if (!sameLocalDay(self.starts_at, other.starts_at)) return false;
    // Published recurring-series instances rarely share a chat post's title:
    // match them on venue + date + slot instead.
    return isDuplicateOf(self, other) || isSeriesInstanceDuplicate(self, other);
  });
}

function sameLocalDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const fmt = (v: string) =>
    new Date(Date.parse(v)).toLocaleDateString("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
  return fmt(a) === fmt(b);
}

function prevDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function nextDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
