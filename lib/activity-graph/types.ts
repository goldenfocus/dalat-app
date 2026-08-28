export const ACTIVITY_GRAPH_VERSION = "activity-graph-v0.2";

export type ActivityKind =
  | "event"
  | "recurring_activity"
  | "exhibition"
  | "workshop"
  | "class"
  | "performance"
  | "market"
  | "religious_activity"
  | "sports"
  | "community_activity"
  | "seasonal_activity"
  | "bookable_experience"
  | "other";

export interface ActivitySource {
  id: string;
  slug: string;
  name: string;
  canonical_url: string;
  discovery_url: string | null;
  page_path_prefix: string | null;
  source_kind: string;
  fetch_mode: "json_ld_sitemap" | "verified_recurring_page" | string;
  access_basis: string;
  trust_tier: number;
  policy_status: "pending" | "approved" | "blocked" | "needs_recheck";
  crawl_interval_minutes: number;
  max_items_per_run: number;
  status: "active" | "paused" | "blocked" | "degraded";
  auto_publish_enabled: boolean;
  auto_publish_threshold: number;
  organizer_id: string | null;
  venue_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface FieldEvidence {
  fieldPath: string;
  rawValue: unknown;
  normalizedValue?: unknown;
  evidenceText?: string;
  locator: string;
  confidence: number;
  explicit?: boolean;
}

export interface TicketTier {
  name: string;
  price: number;
  currency: string;
  description?: string;
}

/**
 * A promotional image advertised by the canonical source. Discovery is not a
 * reuse grant: candidates stay in the private observation record unless the
 * source-level media policy is explicitly changed from `reference_only`.
 */
export interface ActivityMediaCandidate {
  url: string;
  role: "primary" | "gallery";
  sourceUrl: string;
  locator: string;
  title?: string;
}

export interface ExtractedActivity {
  sourceUid: string;
  sourceUrl: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: "Asia/Ho_Chi_Minh";
  timePrecision: "exact" | "approximate" | "date_only" | "tba" | "recurring";
  rrule: string | null;
  startsAtTime: string | null;
  durationMinutes: number | null;
  firstOccurrence: string | null;
  rruleUntil: string | null;
  locationName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  organizerName: string | null;
  organizerUrl: string | null;
  priceType: "free" | "paid" | "donation" | null;
  ticketTiers: TicketTier[] | null;
  ticketUrl: string | null;
  reservationRequirement:
    | "not_required"
    | "recommended"
    | "required"
    | "unknown"
    | null;
  publicAccess: "confirmed" | "restricted" | "unknown";
  sourcePublishedAt: string | null;
  sourceUpdatedAt: string | null;
  eventStatus:
    | "scheduled"
    | "cancelled"
    | "postponed"
    | "rescheduled"
    | "unknown";
  evidence: FieldEvidence[];
  structuredPayload: Record<string, unknown>;
  attributes: Record<string, boolean | string | number | null>;
  mediaCandidates?: ActivityMediaCandidate[];
}

export interface LocalityResult {
  status: "confirmed" | "outside" | "unknown";
  confidence: number;
  reason: string;
}

export interface ConfidenceResult {
  score: number;
  components: Record<string, number>;
  penalties: Record<string, number>;
  hardGateFailures: string[];
}

export interface DuplicateFeatureVector {
  title: number;
  time: number;
  venue: number;
  organizer: number;
  sourceUrl: number;
}

export interface DuplicateMatch {
  targetType: "event" | "series";
  targetId: string;
  title: string;
  score: number;
  classification:
    | "same_occurrence"
    | "same_series_other_occurrence"
    | "related"
    | "distinct";
  features: DuplicateFeatureVector;
  reason: string;
}

export interface SitemapItem {
  url: string;
  lastModified: string | null;
}
