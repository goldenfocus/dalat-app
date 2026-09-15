import type { SupabaseClient } from "@supabase/supabase-js";
import { triggerTranslationServer } from "@/lib/translations";
import {
  evaluateEventIndexingReadiness,
  type EventIndexingSource,
  type EventIndexingTranslationRow,
} from "@/lib/translations-readiness";
import { CONTENT_LOCALES } from "@/lib/types";
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
  code: "missing_hero" | "missing_promo" | "missing_ai_disclosure" | "documented_visual_gap";
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
    reasons.push({ code: "missing_title", message: "Title is missing or too short" });
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
    const horizon = evaluateDiscoveryHorizon(new Date(event.starts_at), options.now);
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
    reasons.push({ code: "missing_location", message: "Venue / location_name is required" });
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
      message: "A published event with the same title and date already exists",
    });
  }
  const documentedGap = isDocumentedVisualGap(event.source_metadata);
  if (!event.image_url?.trim() && !documentedGap) {
    reasons.push({
      code: "missing_image",
      message: "Hero image is missing and no visual gap is documented",
    });
  }
  const promoCount = options.promoCount ?? 0;
  if ((promoCount < 2 || promoCount > 4) && !documentedGap) {
    reasons.push({
      code: "missing_promo",
      message: `Promo gallery has ${promoCount} image(s); visual-truth requires 2–4 distinct images, or a documented visual_gap`,
    });
  }
  return reasons;
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

  // triggerTranslationServer is a compatibility shim (logs only). The durable
  // enqueue the running worker cannot miss is source_metadata.translation_needed_at
  // plus missing content_translations. Do not also trigger on scout ingest —
  // WhatsApp/scout drafts share this publish hook. Review never writes locale
  // strings itself.
  await queuePublishedEventTranslation(event);

  return {
    passed: true,
    published: true,
    reasons: [],
    event: { id: event.id, slug: event.slug, status: "published" },
  };
}

function queuePublishedEventTranslation(event: ReviewEventSnapshot) {
  const fieldsToTranslate: { field_name: "title" | "description"; text: string }[] = [];
  if (event.title?.trim()) {
    fieldsToTranslate.push({ field_name: "title", text: event.title });
  }
  if (event.description?.trim()) {
    fieldsToTranslate.push({ field_name: "description", text: event.description });
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
    .select("content_id, target_locale, field_name, translated_text, updated_at")
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
  const expectedLocales = CONTENT_LOCALES.filter((locale) => locale !== sourceLocale);
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
    heroPresent && visualGapCoversPromo(event.source_metadata) && promoRows.length < 2;
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

  const translationsPassed = gaps.length === 0 && expectedLocales.length === readyTranslated.length;
  const imagesPassed = imageGaps.length === 0;

  return {
    passed: translationsPassed && imagesPassed,
    event: { id: event.id, slug: event.slug, status: event.status },
    translations: {
      passed: translationsPassed,
      readyLocales: readyTranslated,
      missingLocales: expectedLocales.filter((locale) => !readyTranslated.includes(locale)),
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
  const next = nextDay(day);
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .ilike("title", event.title)
    .eq("status", "published")
    .neq("id", event.id)
    .gte("starts_at", day)
    .lt("starts_at", next)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[review-gate] duplicate lookup failed", error);
    return false;
  }
  return Boolean(data);
}

function nextDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
