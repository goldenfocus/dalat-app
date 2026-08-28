/**
 * DaLat News Aggregation System - Core Types
 */

/**
 * Source tiers are deliberately editorial rather than popularity rankings.
 * A is primary/official evidence; E is unverified material that must never be
 * treated as publication-ready on its own.
 */
export type SourceTier = 'A' | 'B' | 'C' | 'D' | 'E';

export type NewsSourceType =
  | 'official'
  | 'established-newsroom'
  | 'local-newsroom'
  | 'community'
  | 'unverified';

export interface NewsSource {
  id: string;
  name: string;
  baseUrl: string;
  discoveryUrl: string;
  tier: SourceTier;
  sourceType: NewsSourceType;
  official: boolean;
  /** CSS selectors or patterns for article extraction */
  selectors: {
    articleList: string;
    articleLink: string;
    title: string;
    content: string;
    image: string;
    date: string;
    author?: string;
  };
  /** Maximum articles per scrape run */
  maxArticles: number;
  /** Delay between requests in ms */
  requestDelay: number;
}

export interface ScrapedArticle {
  sourceId: string;
  sourceUrl: string;
  sourceName: string;
  title: string;
  content: string;
  imageUrls: string[];
  publishedAt: string | null;
  /**
   * Fetch time for provenance. Optional until the raw-article route is adapted;
   * the processor supplies one stable processing timestamp when absent.
   */
  retrievedAt?: string | null;
}

export interface ArticleCluster {
  clusterId: string;
  topicFingerprint: string;
  keywords: string[];
  articles: ScrapedArticle[];
}

export interface NewsProcessResult {
  scraped: number;
  newArticles: number;
  duplicatesSkipped: number;
  errors: number;
  errorMessages: string[];
}

export interface SourceTierMetadata {
  tier: SourceTier;
  label: string;
  description: string;
  trustScore: number;
  requiresCorroboration: boolean;
}

/** A source as presented to the claim extractor. */
export interface ClaimExtractionSource {
  sourceIndex: number;
  sourceId: string;
  sourceUrl: string;
  publisher: string;
  tier: SourceTier;
  title: string;
  text: string;
  publishedAt: string | null;
  retrievedAt: string;
}

/** Untrusted claim-shaped output from the extraction model. */
export interface ClaimCandidate {
  sourceIndex: number;
  key: string;
  value: string;
  confidence: number;
  evidenceFragment: string;
}

export type ClaimRejectionReason =
  | 'invalid-source-index'
  | 'invalid-claim'
  | 'unsupported-key'
  | 'invalid-confidence'
  | 'missing-evidence'
  | 'evidence-too-long'
  | 'evidence-not-found'
  | 'value-not-supported'
  | 'key-not-supported'
  | 'relative-date'
  | 'conflicting-value';

export interface AcceptedClaim {
  id: string;
  sourceIndex: number;
  sourceId: string;
  sourceUrl: string;
  publisher: string;
  sourceTier: SourceTier;
  key: string;
  value: string;
  normalizedKey: string;
  normalizedValue: string;
  confidence: number;
  retrievedAt: string;
  publishedAt: string | null;
  /** At most 20 words and deterministically matched against the source text. */
  evidenceFragment: string;
}

export interface RejectedClaim {
  candidate: ClaimCandidate;
  reason: ClaimRejectionReason;
  detail: string;
}

export interface VerifiedFactGroup {
  id: string;
  normalizedKey: string;
  normalizedValue: string;
  value: string;
  claimIds: string[];
  sourceIndexes: number[];
  sourceUrls: string[];
  confidence: number;
}

export interface VerificationMetrics {
  sourceQuality: number;
  corroboration: number;
  extractionSupport: number;
  freshness: number;
  agreement: number;
}

export interface VerifiedClaimLedger {
  acceptedClaims: AcceptedClaim[];
  rejectedClaims: RejectedClaim[];
  factGroups: VerifiedFactGroup[];
  candidateCount: number;
  conflictingKeyCount: number;
  metrics: VerificationMetrics;
}

export interface NewsSourceProvenance {
  [key: string]: unknown;
  url: string;
  title: string;
  publisher: string;
  published_at: string | null;
  tier: SourceTier;
  retrieved_at: string;
  /**
   * Article-level digest of the accepted normalized fact set. It is repeated
   * on every source record so the existing JSON-array shape remains backwards
   * compatible with public source, feed, and structured-data consumers.
   */
  accepted_fact_fingerprint?: string;
  /** Article-body revision this provenance was used to generate. */
  content_updated_at?: string;
  claims: Array<{
    id: string;
    source_index: number;
    normalized_key: string;
    normalized_value: string;
    confidence: number;
    evidence_fragment: string;
  }>;
}

export interface NewsContentOutput {
  title: string;
  storyContent: string;
  technicalContent: string;
  metaDescription: string;
  seoKeywords: string[];
  suggestedSlug: string;
  newsTags: string[];
  newsTopic: string;
  /** AI-generated image descriptions for fallback cover image generation */
  imageDescriptions: string[];
  sourceUrls: NewsSourceProvenance[];
  internalLinks: Array<{
    text: string;
    url: string;
    type: 'event' | 'venue' | 'location';
  }>;
  verification: VerifiedClaimLedger;
  /**
   * Kept so existing callers can migrate incrementally. Publication scoring no
   * longer uses these presentation-oriented fields.
   */
  qualityFactors: {
    sourceCount: number;
    hasDates: boolean;
    hasNamedSources: boolean;
    hasImages: boolean;
    contentLength: number;
    dalatRelevance: number;
  };
}

export interface QualityScore {
  total: number;
  /** Weighted contributions; together they sum to total. */
  breakdown: VerificationMetrics;
  /** `experimental` remains for old database callers, but is never emitted. */
  suggestedStatus: 'published' | 'experimental' | 'draft';
}
