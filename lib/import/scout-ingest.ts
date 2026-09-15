import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromZonedTime } from "date-fns-tz";
import {
  downloadAndUploadImage,
  findOrCreateOrganizer,
  generateMapsUrl,
  generateUniqueSlug,
  slugify,
} from "./utils";
import { evaluateDiscoveryHorizon } from "./horizon";
import {
  AI_VISUAL_DISCLOSURE_ALT,
  AI_VISUAL_DISCLOSURE_CAPTION,
  type ScoutIngestInput,
} from "./scout-schema";
import { canonicalizeSourceUrl, isSafePublicHttpUrl } from "./safe-url";
import { resolveStoredSourceLocale } from "./source-locale";

const DALAT_TZ = "Asia/Ho_Chi_Minh";

export type ScoutIngestResult =
  | {
      ok: true;
      id: string;
      slug: string;
      status: "draft" | "published" | "cancelled";
      created: boolean;
      updated: boolean;
      duplicate: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
      starts_at?: string;
    };

type ExistingEvent = {
  id: string;
  slug: string;
  status: "draft" | "published" | "cancelled";
  source_platform: string | null;
  source_metadata: Record<string, unknown> | null;
  created_by: string;
  image_url: string | null;
  image_alt: string | null;
};

export async function ingestScoutEvent(
  supabase: SupabaseClient,
  input: ScoutIngestInput,
  options: { now?: Date } = {},
): Promise<ScoutIngestResult> {
  const sourceUrl = canonicalizeSourceUrl(input.source_url);
  if (!sourceUrl) {
    return { ok: false, status: 400, error: "Invalid source_url" };
  }

  const startsAt = resolveTimestamp(input.starts_at, input.date, input.time);
  if (!startsAt) {
    return {
      ok: false,
      status: 400,
      error: "Could not parse starts_at / date+time (Asia/Ho_Chi_Minh)",
    };
  }
  const endsAt = input.ends_at
    ? resolveTimestamp(input.ends_at, undefined, undefined)
    : null;
  if (input.ends_at && !endsAt) {
    return { ok: false, status: 400, error: "Could not parse ends_at" };
  }

  const horizon = evaluateDiscoveryHorizon(startsAt, options.now ?? new Date());
  if (!horizon.ok) {
    return {
      ok: false,
      status: 422,
      error:
        horizon.code === "past_event"
          ? "Event starts in the past"
          : "Event is more than 45 days out",
      code: horizon.code,
      starts_at: horizon.startsAt,
    };
  }

  const createdBy = await resolveCreatedBy(supabase);
  const locationName = (input.location_name || input.venue || "").trim();
  const existing = await findExistingBySourceUrl(supabase, sourceUrl);

  if (existing?.source_platform === "activity-graph") {
    return {
      ok: false,
      status: 409,
      error: "Refusing to overwrite an Activity Graph listing",
      code: "activity_graph_lane",
    };
  }

  if (existing && existing.status !== "draft" && existing.status !== "published") {
    return {
      ok: true,
      id: existing.id,
      slug: existing.slug,
      status: existing.status,
      created: false,
      updated: false,
      duplicate: true,
    };
  }

  const slug =
    existing?.slug ??
    (await generateUniqueSlug(supabase, slugify(input.title) || "event"));
  const organizerId = input.organizer_name
    ? await findOrCreateOrganizer(supabase, input.organizer_name)
    : null;

  const visuals = await attachVisuals(slug, input);
  if (!visuals.heroUrl && !input.visual_gap_reason) {
    return {
      ok: false,
      status: 400,
      error: "Hero image is missing and no visual_gap_reason was provided",
      code: "missing_visual",
    };
  }
  if (visuals.heroUrl && visuals.promo.length < 2 && !input.visual_gap_reason) {
    return {
      ok: false,
      status: 400,
      error:
        "Promo gallery needs 2–4 distinct images after fetch; send more source/promo URLs or visual_gap_reason. Do not invent images.",
      code: "missing_promo",
    };
  }
  if (existing?.status === "published") {
    return refreshPublishedVisuals(supabase, existing, input, sourceUrl, createdBy, visuals);
  }

  const metadata = buildMetadata(input, sourceUrl, existing?.source_metadata, visuals);

  const row = {
    slug,
    title: input.title,
    description: input.description,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt ? endsAt.toISOString() : null,
    location_name: locationName,
    address: input.address ?? null,
    google_maps_url:
      input.google_maps_url ??
      generateMapsUrl(undefined, undefined, locationName, "Đà Lạt"),
    external_chat_url: sourceUrl,
    image_url: visuals.heroUrl,
    image_alt: visuals.heroAlt,
    status: "draft" as const,
    timezone: DALAT_TZ,
    organizer_id: organizerId,
    created_by: existing?.created_by ?? createdBy,
    source_platform: input.source_platform?.trim() || "scout",
    source_locale:
      resolveStoredSourceLocale(input.source_locale, input.title, input.description) ??
      null,
    source_metadata: metadata,
  };

  const saved = existing
    ? await updateDraft(supabase, existing.id, row)
    : await insertDraft(supabase, row);

  if (!saved) {
    return { ok: false, status: 500, error: "Failed to write draft event" };
  }

  await replacePromoMedia(supabase, saved.id, createdBy, visuals.promo);

  return {
    ok: true,
    id: saved.id,
    slug: saved.slug,
    status: "draft",
    created: !existing,
    updated: Boolean(existing),
    duplicate: false,
  };
}

export function resolveTimestamp(
  isoOrDateTime?: string,
  date?: string,
  time?: string,
): Date | null {
  if (isoOrDateTime) {
    const trimmed = isoOrDateTime.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
      const local = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
      const converted = fromZonedTime(local, DALAT_TZ);
      return Number.isNaN(converted.getTime()) ? null : converted;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (!date) return null;
  const clock = time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  const converted = fromZonedTime(`${date}T${clock}:00`, DALAT_TZ);
  return Number.isNaN(converted.getTime()) ? null : converted;
}

async function resolveCreatedBy(supabase: SupabaseClient): Promise<string> {
  if (process.env.IMPORT_CREATED_BY) return process.env.IMPORT_CREATED_BY;
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", "yan")
    .maybeSingle();
  if (error || !data?.id) {
    throw new Error("IMPORT_CREATED_BY not set and no 'yan' profile found");
  }
  return data.id;
}

async function findExistingBySourceUrl(
  supabase: SupabaseClient,
  sourceUrl: string,
): Promise<ExistingEvent | null> {
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, status, source_platform, source_metadata, created_by, image_url, image_alt")
    .eq("external_chat_url", sourceUrl)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Source lookup failed: ${error.message}`);
  }
  return (data as ExistingEvent | null) ?? null;
}

async function insertDraft(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ id: string; slug: string } | null> {
  const { data, error } = await supabase
    .from("events")
    .insert(row)
    .select("id, slug")
    .single();
  if (error || !data) {
    console.error("[scout-ingest] insert failed", error);
    return null;
  }
  return data;
}

async function updateDraft(
  supabase: SupabaseClient,
  id: string,
  row: Record<string, unknown>,
): Promise<{ id: string; slug: string } | null> {
  const patch = { ...row };
  delete patch.slug;
  delete patch.created_by;
  const { data, error } = await supabase
    .from("events")
    .update(patch)
    .eq("id", id)
    .select("id, slug")
    .single();
  if (error || !data) {
    console.error("[scout-ingest] update failed", error);
    return null;
  }
  return data;
}

type PromoItem = {
  media_url: string;
  title: string;
  caption: string;
  original_filename: string | null;
  is_ai_suggested: boolean;
};

async function attachVisuals(
  slug: string,
  input: ScoutIngestInput,
): Promise<{
  heroUrl: string | null;
  heroAlt: string | null;
  promo: PromoItem[];
  provenance: "owner_authorized_source" | "ai_generated";
}> {
  const provenance = input.visual_provenance ?? "owner_authorized_source";
  const disclosureRequired = provenance === "ai_generated";
  const heroAlt = disclosureRequired
    ? input.image_alt && /ai[- ]generated/i.test(input.image_alt)
      ? input.image_alt
      : AI_VISUAL_DISCLOSURE_ALT
    : input.image_alt ?? "Event image from the organizer or venue source.";
  const caption = disclosureRequired
    ? input.image_caption && /ai[- ]generated/i.test(input.image_caption)
      ? input.image_caption
      : AI_VISUAL_DISCLOSURE_CAPTION
    : input.image_caption ?? `Source: ${input.source_url}`;

  const sourceUrls = input.source_image_urls ?? [];
  const promoUrls = input.promo_image_urls ?? [];
  const heroSource = sourceUrls[0] ?? promoUrls[0] ?? null;
  const extra = [
    ...sourceUrls.slice(heroSource && sourceUrls[0] === heroSource ? 1 : 0),
    ...promoUrls.filter((url) => url !== heroSource),
  ].slice(0, 4);

  const heroUrl = heroSource ? await safeDownload(heroSource, slug) : null;
  const promo: PromoItem[] = [];
  for (const [index, url] of extra.entries()) {
    const uploaded = await safeDownload(url, `${slug}-promo-${index + 1}`);
    if (!uploaded) continue;
    promo.push({
      media_url: uploaded,
      title: disclosureRequired
        ? `AI-generated illustration — promo ${index + 1}`
        : `Promo image ${index + 1}`,
      caption,
      original_filename: null,
      is_ai_suggested: disclosureRequired,
    });
  }

  return { heroUrl, heroAlt: heroUrl ? heroAlt : null, promo, provenance };
}

async function safeDownload(url: string, slug: string): Promise<string | null> {
  if (!(await isSafePublicHttpUrl(url))) {
    console.warn(`[scout-ingest] skipped unsafe image URL: ${url}`);
    return null;
  }
  return downloadAndUploadImage(url, slug);
}

function visualMetadata(
  input: ScoutIngestInput,
  visuals: { provenance: string; heroUrl: string | null; promo: PromoItem[] },
): Record<string, unknown> {
  return {
    visual_provenance: visuals.provenance,
    visual_gap: resolveVisualGap(input, visuals),
    hero_present: Boolean(visuals.heroUrl),
    promo_count: visuals.promo.length,
  };
}

function buildMetadata(
  input: ScoutIngestInput,
  sourceUrl: string,
  previous: Record<string, unknown> | null | undefined,
  visuals: { provenance: string; heroUrl: string | null; promo: PromoItem[] },
): Record<string, unknown> {
  const prior = previous && typeof previous === "object" ? previous : {};
  return {
    ...prior,
    ingest_lane: "scout-review",
    needs_review: true,
    review_result: null,
    rejected_at: null,
    reject_reasons: null,
    source_url: sourceUrl,
    source_url_hash: createHash("sha256").update(sourceUrl).digest("hex"),
    imported_at: new Date().toISOString(),
    time_inferred: !input.starts_at && !input.time,
    ...visualMetadata(input, visuals),
  };
}

async function refreshPublishedVisuals(
  supabase: SupabaseClient,
  existing: ExistingEvent,
  input: ScoutIngestInput,
  sourceUrl: string,
  createdBy: string,
  visuals: {
    heroUrl: string | null;
    heroAlt: string | null;
    promo: PromoItem[];
    provenance: "owner_authorized_source" | "ai_generated";
  },
): Promise<ScoutIngestResult> {
  const prior =
    existing.source_metadata && typeof existing.source_metadata === "object"
      ? existing.source_metadata
      : {};
  const heroUrl = visuals.heroUrl ?? existing.image_url;
  const heroAlt = visuals.heroUrl ? visuals.heroAlt : existing.image_alt;
  const metadata = {
    ...prior,
    source_url: sourceUrl,
    source_url_hash: createHash("sha256").update(sourceUrl).digest("hex"),
    ...visualMetadata(input, visuals),
  };

  const { data, error } = await supabase
    .from("events")
    .update({
      image_url: heroUrl,
      image_alt: heroAlt,
      source_metadata: metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .eq("status", "published")
    .select("id, slug, status")
    .single();

  if (error || !data) {
    console.error("[scout-ingest] published visual refresh failed", error);
    return { ok: false, status: 500, error: "Failed to refresh published event visuals" };
  }

  await replacePromoMedia(supabase, existing.id, createdBy, visuals.promo);

  return {
    ok: true,
    id: data.id,
    slug: data.slug,
    status: "published",
    created: false,
    updated: true,
    duplicate: false,
  };
}

function resolveVisualGap(
  input: ScoutIngestInput,
  visuals: { heroUrl: string | null; promo: PromoItem[] },
): { reason: string; documented_at: string; covers: Array<"hero" | "promo"> } | null {
  if (!input.visual_gap_reason) return null;
  const covers: Array<"hero" | "promo"> = [];
  if (!visuals.heroUrl) covers.push("hero", "promo");
  else if (visuals.promo.length < 2) covers.push("promo");
  if (covers.length === 0) return null;
  return {
    reason: input.visual_gap_reason,
    documented_at: new Date().toISOString(),
    covers,
  };
}

async function replacePromoMedia(
  supabase: SupabaseClient,
  eventId: string,
  createdBy: string,
  promo: PromoItem[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("promo_media")
    .delete()
    .eq("event_id", eventId);
  if (deleteError) {
    console.error("[scout-ingest] promo cleanup failed", deleteError);
  }

  if (promo.length > 0) {
    const { error } = await supabase.from("promo_media").insert(
      promo.map((item, index) => ({
        event_id: eventId,
        media_type: "image",
        media_url: item.media_url,
        thumbnail_url: item.media_url,
        title: item.title,
        caption: item.caption,
        sort_order: index,
        is_ai_suggested: item.is_ai_suggested,
        created_by: createdBy,
      })),
    );
    if (error) {
      console.error("[scout-ingest] promo insert failed", error);
      return;
    }
  }

  await supabase
    .from("events")
    .update({ has_promo_override: promo.length > 0 })
    .eq("id", eventId);
}
