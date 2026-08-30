export const NEWS_AUTO_PUBLISH_MAX_AGE_HOURS = 72;
export const NEWS_REVIEW_MAX_AGE_HOURS = 7 * 24;
export const NEWS_MAX_FUTURE_SKEW_HOURS = 2;
export const NEWS_FEED_MAX_AGE_DAYS = 14;

export type NewsFreshnessDisposition =
  | 'fresh'
  | 'needs-review'
  | 'historical'
  | 'missing-date'
  | 'future-date';

export interface NewsFreshnessDecision {
  disposition: NewsFreshnessDisposition;
  sourcePublishedAt: string | null;
  ageHours: number | null;
  autoPublishEligible: boolean;
  reason: string;
}

interface EditorialReviewLike {
  disposition: 'current-news' | 'evergreen' | 'reject';
  dalatRelevance: number;
  newsworthiness: number;
}

export function editorialReviewApprovesNewArticle(
  review: EditorialReviewLike
): boolean {
  return review.disposition === 'current-news'
    && review.dalatRelevance >= 0.5
    && review.newsworthiness >= 0.6;
}

/** AI review can veto a story, but it can never override date/evidence gates. */
export function resolveEditorialPublicationCandidate(input: {
  freshness: NewsFreshnessDecision;
  review: EditorialReviewLike;
  verificationStatus: 'published' | 'experimental' | 'draft';
  existingUrl: boolean;
}): 'published' | 'draft' {
  if (!input.freshness.autoPublishEligible) return 'draft';
  if (!input.existingUrl && !editorialReviewApprovesNewArticle(input.review)) return 'draft';
  return input.verificationStatus === 'published' ? 'published' : 'draft';
}

function validIsoTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Hard publication gate. Retrieval time is intentionally irrelevant: seeing an
 * old page today does not make the reporting current.
 */
export function evaluateNewsFreshness(
  publishedAt: string | null | undefined,
  now = new Date()
): NewsFreshnessDecision {
  const timestamp = validIsoTimestamp(publishedAt);
  if (timestamp === null) {
    return {
      disposition: 'missing-date',
      sourcePublishedAt: null,
      ageHours: null,
      autoPublishEligible: false,
      reason: 'Source publication time is missing or invalid',
    };
  }

  const ageHours = (now.getTime() - timestamp) / 3_600_000;
  const sourcePublishedAt = new Date(timestamp).toISOString();
  if (ageHours < -NEWS_MAX_FUTURE_SKEW_HOURS) {
    return {
      disposition: 'future-date',
      sourcePublishedAt,
      ageHours,
      autoPublishEligible: false,
      reason: `Source publication time is ${Math.round(Math.abs(ageHours))}h in the future`,
    };
  }
  if (ageHours <= NEWS_AUTO_PUBLISH_MAX_AGE_HOURS) {
    return {
      disposition: 'fresh',
      sourcePublishedAt,
      ageHours: Math.max(0, ageHours),
      autoPublishEligible: true,
      reason: `Source reporting is ${Math.round(Math.max(0, ageHours))}h old`,
    };
  }
  if (ageHours <= NEWS_REVIEW_MAX_AGE_HOURS) {
    return {
      disposition: 'needs-review',
      sourcePublishedAt,
      ageHours,
      autoPublishEligible: false,
      reason: `Source reporting is ${Math.round(ageHours)}h old and requires an editor`,
    };
  }
  return {
    disposition: 'historical',
    sourcePublishedAt,
    ageHours,
    autoPublishEligible: false,
    reason: `Source reporting is ${Math.round(ageHours / 24)}d old`,
  };
}

/** Most recent real source timestamp is the public news date/news peg. */
export function newestSourcePublication(
  values: Array<string | null | undefined>
): string | null {
  const timestamps = values
    .map(validIsoTimestamp)
    .filter((value): value is number => value !== null);
  return timestamps.length > 0
    ? new Date(Math.max(...timestamps)).toISOString()
    : null;
}

export function freshnessQueueStatus(
  decision: NewsFreshnessDecision
): 'pending' | 'review' | 'skipped' {
  if (decision.disposition === 'fresh') return 'pending';
  if (
    decision.disposition === 'needs-review' ||
    decision.disposition === 'missing-date' ||
    decision.disposition === 'future-date'
  ) return 'review';
  return 'skipped';
}
