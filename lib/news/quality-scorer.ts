/**
 * Verification scoring for news articles.
 * Presentation polish is intentionally excluded from publication eligibility.
 */

import type {
  NewsContentOutput,
  QualityScore,
  VerifiedClaimLedger,
  VerificationMetrics,
} from './types';

export const NEWS_AUTO_PUBLISH_THRESHOLD = 0.85;

const WEIGHTS: VerificationMetrics = {
  sourceQuality: 0.25,
  corroboration: 0.25,
  extractionSupport: 0.2,
  freshness: 0.15,
  agreement: 0.15,
};

const ZERO_METRICS: VerificationMetrics = {
  sourceQuality: 0,
  corroboration: 0,
  extractionSupport: 0,
  freshness: 0,
  agreement: 0,
};

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** Score a verified ledger without requiring article generation first. */
export function calculateVerificationQualityScore(
  verification: Pick<VerifiedClaimLedger, 'metrics'> | null | undefined
): QualityScore {
  const metrics = verification?.metrics ?? ZERO_METRICS;
  const breakdown: VerificationMetrics = {
    sourceQuality: clamp01(metrics.sourceQuality) * WEIGHTS.sourceQuality,
    corroboration: clamp01(metrics.corroboration) * WEIGHTS.corroboration,
    extractionSupport: clamp01(metrics.extractionSupport) * WEIGHTS.extractionSupport,
    freshness: clamp01(metrics.freshness) * WEIGHTS.freshness,
    agreement: clamp01(metrics.agreement) * WEIGHTS.agreement,
  };
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  return {
    total,
    breakdown,
    suggestedStatus: total >= NEWS_AUTO_PUBLISH_THRESHOLD ? 'published' : 'draft',
  };
}

/**
 * The second parameter is retained so existing callers do not need a flag-day
 * migration. AI-assessed newsworthiness no longer influences publication.
 */
export function calculateQualityScore(
  content: NewsContentOutput,
  _legacyNewsworthiness?: number
): QualityScore {
  return calculateVerificationQualityScore(content.verification);
}
