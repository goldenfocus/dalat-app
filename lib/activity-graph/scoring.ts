import type {
  ActivitySource,
  ConfidenceResult,
  DuplicateFeatureVector,
  DuplicateMatch,
  ExtractedActivity,
  LocalityResult,
} from "./types";
import { isLamVienTbdActivity } from "./lam-vien-tbd";

const DALAT_CENTER = { latitude: 11.9404, longitude: 108.4583 };
const DALAT_RADIUS_KM = 35;

export function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSimilarity(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const left = new Set(normalizeForMatch(a).split(" ").filter(Boolean));
  const right = new Set(normalizeForMatch(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function evaluateDalatLocality(
  activity: ExtractedActivity,
): LocalityResult {
  if (activity.latitude !== null && activity.longitude !== null) {
    const distance = haversineKm(
      activity.latitude,
      activity.longitude,
      DALAT_CENTER.latitude,
      DALAT_CENTER.longitude,
    );
    return distance <= DALAT_RADIUS_KM
      ? {
          status: "confirmed",
          confidence: 100,
          reason: `${distance.toFixed(1)} km from Đà Lạt centre`,
        }
      : {
          status: "outside",
          confidence: 100,
          reason: `${distance.toFixed(1)} km outside the Đà Lạt activity radius`,
        };
  }

  const locationText = normalizeForMatch(
    `${activity.locationName ?? ""} ${activity.address ?? ""}`,
  );
  const explicitOutside = [
    "phan thiet",
    "mui ne",
    "gia nghia",
    "bao loc",
    "ho chi minh",
    "sai gon",
    "ha noi",
    "hanoi",
    "vinh",
    "nghe an",
    "da nang",
    "nha trang",
    "hai phong",
    "quy nhon",
    "ho tram",
    "can tho",
    "da teh",
  ].find((place) => locationText.includes(place));
  if (explicitOutside) {
    return {
      status: "outside",
      confidence: 100,
      reason: `Explicit non-Đà-Lạt place: ${explicitOutside}`,
    };
  }
  if (/\bda lat\b|\bdalat\b/.test(locationText)) {
    return {
      status: "confirmed",
      confidence: 92,
      reason: "Address explicitly names Đà Lạt",
    };
  }
  // "Lâm Đồng" is intentionally insufficient after the 2025 province merger.
  return {
    status: "unknown",
    confidence: 0,
    reason: "No coordinates or explicit Đà Lạt locality",
  };
}

function evidenceCoverage(activity: ExtractedActivity): number {
  const fields = new Set(activity.evidence.map((row) => row.fieldPath));
  const hasSchedule =
    activity.kind === "recurring_activity"
      ? fields.has("rrule") && fields.has("starts_at_time")
      : fields.has("starts_at");
  const covered = [
    fields.has("title"),
    hasSchedule,
    fields.has("address") || fields.has("location_name"),
    fields.has("public_access") ||
      fields.has("event_status") ||
      fields.has("ticket_tiers"),
  ].filter(Boolean).length;
  return Math.round((covered / 4) * 25);
}

export function scoreActivity(
  activity: ExtractedActivity,
  source: ActivitySource,
  locality: LocalityResult,
  now: Date = new Date(),
): ConfidenceResult {
  const lamVienTbd = isLamVienTbdActivity(activity);
  const components: Record<string, number> = {
    sourceAuthority:
      ({ 1: 25, 2: 22, 3: 17, 4: 10, 5: 5 } as Record<number, number>)[
        source.trust_tier
      ] ?? 0,
    evidenceCoverage: evidenceCoverage(activity),
    deterministicParser: [
      "json_ld_sitemap",
      "verified_recurring_page",
      // Scout submissions are fetched again by the server and every required
      // quote is checked against that page before projection.
      "manual",
    ].includes(source.fetch_mode)
      ? 15
      : 8,
    scheduleCertainty:
      activity.timePrecision === "exact" ||
      activity.timePrecision === "recurring" ||
      lamVienTbd
        ? 15
        : 0,
    localityCertainty: locality.status === "confirmed" ? 10 : 0,
    canonicalSource: sameOrigin(activity.sourceUrl, source.canonical_url)
      ? 5
      : 0,
    publicAccess:
      activity.publicAccess === "confirmed" || lamVienTbd ? 5 : 0,
  };
  const penalties: Record<string, number> = {
    cancelledOrPostponed: ["cancelled", "postponed"].includes(
      activity.eventStatus,
    )
      ? 100
      : 0,
    localityConflict: locality.status === "outside" ? 100 : 0,
  };
  const hardGateFailures: string[] = [];

  if (source.status !== "active" && source.status !== "degraded")
    hardGateFailures.push("source_not_active");
  if (source.policy_status !== "approved")
    hardGateFailures.push("source_policy_not_approved");
  if (!source.auto_publish_enabled)
    hardGateFailures.push("auto_publish_disabled");
  if (locality.status !== "confirmed")
    hardGateFailures.push(`locality_${locality.status}`);
  if (activity.publicAccess !== "confirmed" && !lamVienTbd)
    hardGateFailures.push("public_access_unconfirmed");
  if (!sameOrigin(activity.sourceUrl, source.canonical_url))
    hardGateFailures.push("cross_origin_source_url");
  if (["cancelled", "postponed"].includes(activity.eventStatus)) {
    hardGateFailures.push(`event_${activity.eventStatus}`);
  }
  if (activity.kind === "recurring_activity") {
    if (
      !activity.rrule ||
      !activity.startsAtTime ||
      !activity.firstOccurrence
    ) {
      hardGateFailures.push("incomplete_recurrence");
    }
  } else {
    if (
      !activity.startsAt ||
      (activity.timePrecision !== "exact" && !lamVienTbd)
    ) {
      hardGateFailures.push("exact_start_required");
    } else if (new Date(activity.startsAt).getTime() <= now.getTime()) {
      hardGateFailures.push("past_occurrence");
    }
  }
  if (!activity.title.trim()) hardGateFailures.push("missing_title");
  if (!activity.evidence.some((row) => row.fieldPath === "title"))
    hardGateFailures.push("missing_title_evidence");

  const raw =
    Object.values(components).reduce((sum, value) => sum + value, 0) -
    Object.values(penalties).reduce((sum, value) => sum + value, 0);
  return {
    score: Math.max(0, Math.min(100, Math.round(raw))),
    components,
    penalties,
    hardGateFailures,
  };
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

export function freshnessScore(
  lastConfirmedAt: string | Date,
  halfLifeDays: number,
  sourceHealth = 1,
  now: Date = new Date(),
): number {
  const confirmed = new Date(lastConfirmedAt).getTime();
  if (!Number.isFinite(confirmed) || halfLifeDays <= 0) return 0;
  const ageDays = Math.max(0, (now.getTime() - confirmed) / 86_400_000);
  const score =
    100 *
    Math.exp((-Math.log(2) * ageDays) / halfLifeDays) *
    Math.max(0, Math.min(1, sourceHealth));
  return Math.max(0, Math.min(100, Math.round(score)));
}

export interface EventMatchRow {
  id: string;
  title: string;
  starts_at: string;
  location_name: string | null;
  address: string | null;
  organizer_id: string | null;
  external_chat_url: string | null;
  source_platform?: string | null;
}

export interface SeriesMatchRow {
  id: string;
  title: string;
  starts_at_time: string;
  rrule: string;
  location_name: string | null;
  address: string | null;
  organizer_id: string | null;
  external_chat_url: string | null;
  source_platform?: string | null;
}

function venueFeature(
  activity: ExtractedActivity,
  row: { location_name: string | null; address: string | null },
): number {
  const similarity = Math.max(
    tokenSimilarity(activity.locationName, row.location_name),
    tokenSimilarity(activity.address, row.address),
    tokenSimilarity(
      `${activity.locationName} ${activity.address}`,
      `${row.location_name} ${row.address}`,
    ),
  );
  return Math.round(similarity * 20);
}

function classification(
  score: number,
  features: DuplicateFeatureVector,
): DuplicateMatch["classification"] {
  if (features.title >= 28 && features.time >= 28 && features.venue >= 14)
    return "same_occurrence";
  if (score >= 78) return "related";
  return "distinct";
}

export function scoreEventDuplicate(
  activity: ExtractedActivity,
  row: EventMatchRow,
  organizerId: string | null,
): DuplicateMatch {
  const titleSimilarity = tokenSimilarity(activity.title, row.title);
  const title =
    normalizeForMatch(activity.title) === normalizeForMatch(row.title)
      ? 30
      : Math.round(titleSimilarity * 30);
  const candidateTime = activity.startsAt
    ? new Date(activity.startsAt).getTime()
    : NaN;
  const rowTime = new Date(row.starts_at).getTime();
  const minutes = Math.abs(candidateTime - rowTime) / 60_000;
  const time = !Number.isFinite(minutes)
    ? 0
    : minutes <= 15
      ? 30
      : minutes <= 90
        ? 24
        : minutes <= 24 * 60
          ? 12
          : 0;
  const venue = venueFeature(activity, row);
  const organizer = organizerId && row.organizer_id === organizerId ? 10 : 0;
  const sourceUrl =
    row.external_chat_url &&
    canonicalUrl(row.external_chat_url) === canonicalUrl(activity.sourceUrl)
      ? 10
      : 0;
  const features = { title, time, venue, organizer, sourceUrl };
  const score = Object.values(features).reduce((sum, value) => sum + value, 0);
  const kind = classification(score, features);
  return {
    targetType: "event",
    targetId: row.id,
    title: row.title,
    score,
    classification: kind,
    features,
    reason:
      kind === "same_occurrence"
        ? "Exact title, schedule and place agree"
        : score >= 78
          ? "Strong but non-conclusive relationship"
          : "Insufficient overlap",
  };
}

export function scoreSeriesDuplicate(
  activity: ExtractedActivity,
  row: SeriesMatchRow,
  organizerId: string | null,
): DuplicateMatch {
  const titleSimilarity = tokenSimilarity(activity.title, row.title);
  const title =
    normalizeForMatch(activity.title) === normalizeForMatch(row.title)
      ? 30
      : Math.round(titleSimilarity * 30);
  const time =
    activity.startsAtTime?.slice(0, 5) === row.starts_at_time.slice(0, 5) &&
    activity.rrule === row.rrule
      ? 30
      : 0;
  const venue = venueFeature(activity, row);
  const organizer = organizerId && row.organizer_id === organizerId ? 10 : 0;
  const sourceUrl =
    row.external_chat_url &&
    canonicalUrl(row.external_chat_url) === canonicalUrl(activity.sourceUrl)
      ? 10
      : 0;
  const features = { title, time, venue, organizer, sourceUrl };
  const score = Object.values(features).reduce((sum, value) => sum + value, 0);
  const kind = classification(score, features);
  return {
    targetType: "series",
    targetId: row.id,
    title: row.title,
    score,
    classification: kind === "same_occurrence" ? "same_occurrence" : kind,
    features,
    reason:
      kind === "same_occurrence"
        ? "Exact recurring schedule, title and place agree"
        : score >= 78
          ? "Strong but non-conclusive relationship"
          : "Insufficient overlap",
  };
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid"].forEach(
      (key) => url.searchParams.delete(key),
    );
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}
