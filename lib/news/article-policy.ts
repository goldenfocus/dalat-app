import type {
  NewsSourceProvenance,
  QualityScore,
  VerifiedFactGroup,
} from './types';

export type StoredSourceRecord = Record<string, unknown>;

const ACCEPTED_FACT_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Build an article revision identity from facts, not from source ordering,
 * retrieval times, confidence, or generated prose. Corroboration can therefore
 * improve without needlessly rewriting an established URL.
 */
export async function buildAcceptedFactFingerprint(
  facts: Array<Pick<VerifiedFactGroup, 'normalizedKey' | 'normalizedValue'>>
): Promise<string> {
  const canonicalFacts = [...new Map(
    facts.map((fact) => {
      const pair = [fact.normalizedKey, fact.normalizedValue] as const;
      return [`${pair[0]}\u0000${pair[1]}`, pair];
    })
  ).values()].sort((left, right) => {
    const keyOrder = compareCodeUnits(left[0], right[0]);
    return keyOrder || compareCodeUnits(left[1], right[1]);
  });

  if (canonicalFacts.length === 0) {
    throw new Error('Cannot fingerprint an empty accepted fact set');
  }

  const payload = JSON.stringify({ version: 1, facts: canonicalFacts });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

/**
 * Read a complete, internally consistent fingerprint from the source envelope.
 * Missing, malformed, or mixed markers force one cleanup/regeneration pass.
 */
export function getAcceptedFactFingerprint(sources: unknown): string | null {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  let fingerprint: string | null = null;
  for (const source of sources) {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
    const candidate = (source as StoredSourceRecord).accepted_fact_fingerprint;
    if (typeof candidate !== 'string' || !ACCEPTED_FACT_FINGERPRINT_PATTERN.test(candidate)) {
      return null;
    }
    if (fingerprint !== null && candidate !== fingerprint) return null;
    fingerprint = candidate;
  }
  return fingerprint;
}

/** Legacy/malformed envelopes deliberately count as changed for first cleanup. */
export function acceptedFactsHaveChanged(
  existingSources: unknown,
  currentFingerprint: string
): boolean {
  return getAcceptedFactFingerprint(existingSources) !== currentFingerprint;
}

/**
 * Merge fresh provenance into the established article record without dropping
 * older source URLs. A URL is the durable identity of a source snapshot.
 */
export function mergeSourceRecords(
  existing: Array<StoredSourceRecord | NewsSourceProvenance> | null,
  incoming: NewsSourceProvenance[]
): StoredSourceRecord[] {
  const byUrl = new Map<string, StoredSourceRecord>();
  for (const source of [...(existing ?? []), ...incoming]) {
    const record = source as unknown as StoredSourceRecord;
    if (typeof record.url !== 'string' || !record.url) continue;
    byUrl.set(record.url, record);
  }
  return [...byUrl.values()];
}

/** Stamp article-level revision metadata across the complete merged envelope. */
export function stampNewsSourceEnvelope(
  sources: StoredSourceRecord[],
  acceptedFactFingerprint: string,
  contentUpdatedAt: string
): StoredSourceRecord[] {
  return sources.map((source) => ({
    ...source,
    accepted_fact_fingerprint: acceptedFactFingerprint,
    content_updated_at: contentUpdatedAt,
  }));
}

/** Advance the factual revision on an editor-approved existing source envelope. */
export function stampExistingNewsContentRevision(
  sources: unknown,
  contentUpdatedAt: string
): unknown[] | null {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  return sources.map((source) => {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      return source;
    }
    return { ...source, content_updated_at: contentUpdatedAt };
  });
}

/** Latest factual-body revision carried inside source provenance. */
export function getNewsContentUpdatedAt(sources: unknown): string | null {
  if (!Array.isArray(sources)) return null;
  const timestamps = sources.flatMap((source) => {
    if (typeof source !== 'object' || source === null) return [];
    const value = (source as StoredSourceRecord).content_updated_at;
    if (typeof value !== 'string') return [];
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? [timestamp] : [];
  });
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
}

/**
 * Latest public-page change for crawler freshness. Unlike translation
 * invalidation, this includes generic row updates because a reverification can
 * change visible provenance, confidence, status, or "last checked" metadata
 * even when the factual body is byte-for-byte unchanged.
 */
export function getNewsPageModifiedAt(post: {
  source_urls?: unknown;
  updated_at?: unknown;
}): string | null {
  const candidates = [
    getNewsContentUpdatedAt(post.source_urls),
    typeof post.updated_at === 'string' ? post.updated_at : null,
  ].flatMap((value) => {
    if (!value) return [];
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? [timestamp] : [];
  });
  return candidates.length > 0
    ? new Date(Math.max(...candidates)).toISOString()
    : null;
}

export interface BlogTranslationRevision {
  source?: unknown;
  source_urls?: unknown;
  updated_at?: unknown;
}

/**
 * Translation freshness follows the factual revision marker for modern
 * automated news. Provenance-only reverification still advances the generic
 * row timestamp, so taking max(marker, updated_at) would hide otherwise-current
 * translations after every unchanged sweep. Manual posts and legacy/source-free
 * news fall back to the row revision, where a content edit advances updated_at.
 */
export function getBlogTranslationCutoff(
  post: BlogTranslationRevision
): string | null {
  if (post.source === 'news_scrape') {
    const factualRevision = getNewsContentUpdatedAt(post.source_urls);
    if (factualRevision) return factualRevision;
  }

  if (typeof post.updated_at !== 'string') return null;
  const timestamp = Date.parse(post.updated_at);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/** Backward-compatible automated-news-only view of the shared cutoff policy. */
export function getAutomatedNewsTranslationCutoff(
  post: BlogTranslationRevision
): string | null {
  return post.source === 'news_scrape' ? getBlogTranslationCutoff(post) : null;
}

/** Invalid translation timestamps fail closed whenever a cutoff is present. */
export function isTranslationAtOrAfterCutoff(
  translationUpdatedAt: string | null | undefined,
  freshAfter: string | null
): boolean {
  if (!freshAfter) return true;
  if (!translationUpdatedAt) return false;
  const translationTimestamp = Date.parse(translationUpdatedAt);
  const cutoffTimestamp = Date.parse(freshAfter);
  return Number.isFinite(translationTimestamp)
    && Number.isFinite(cutoffTimestamp)
    && translationTimestamp >= cutoffTimestamp;
}

/** A supplied metadata map is an allow-list as well as a freshness source. */
export function isCurrentBlogTranslationForBatch(
  postId: string,
  translationUpdatedAt: string | null | undefined,
  freshAfterByPostId: ReadonlyMap<string, string | null>
): boolean {
  if (!freshAfterByPostId.has(postId)) return false;
  return isTranslationAtOrAfterCutoff(
    translationUpdatedAt,
    freshAfterByPostId.get(postId) ?? null
  );
}

/**
 * A failed confidence gate must not turn an established backlink into a 404.
 * Public news stays reachable as experimental, but only verified content is
 * promoted in feeds/sitemaps as published.
 */
export function resolveNewsPublicationStatus(
  existingStatus: string | null,
  suggestedStatus: QualityScore['suggestedStatus']
): QualityScore['suggestedStatus'] | 'deprecated' | 'archived' {
  // Respect deliberate editorial/legal removals. Restoring one is a human act.
  if (existingStatus === 'deprecated' || existingStatus === 'archived') {
    return existingStatus;
  }
  const wasPublic = existingStatus === 'published' || existingStatus === 'experimental';
  if (!wasPublic) return suggestedStatus;
  return suggestedStatus === 'published' ? 'published' : 'experimental';
}

/** Preserve historical publication identity while allowing a draft's first launch. */
export function resolveNewsPublishedAt(
  existing: { status: string; published_at: string | null } | null,
  nextStatus: string,
  now: string
): string | null {
  if (!existing) return nextStatus === 'published' ? now : null;
  if (existing.published_at) return existing.published_at;
  return existing.status === 'draft' && nextStatus === 'published' ? now : null;
}
