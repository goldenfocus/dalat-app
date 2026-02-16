/**
 * Quality scoring for news articles
 * Determines auto-publish threshold based on weighted criteria
 */

import type { NewsContentOutput, QualityScore } from './types';

const WEIGHTS = {
  sourceCount: 0.15,
  dalatRelevance: 0.20,
  newsworthiness: 0.15,
  contentLength: 0.10,
  hasDates: 0.10,
  hasNamedSources: 0.10,
  hasImages: 0.10,
  originality: 0.10,
};

/**
 * Estimate originality based on content diversity signals.
 * Checks for quotes, attribution, local context, and structural variety.
 * Returns a score from 0.0 to 1.0.
 */
function estimateOriginality(storyContent: string, sourceCount: number): number {
  let score = 0;

  // Having multiple sources implies synthesis (not just paraphrasing one article)
  if (sourceCount >= 3) score += 0.3;
  else if (sourceCount >= 2) score += 0.15;

  // Attributed quotes suggest original journalism framing
  const attributionPatterns = /according to|said|told|reported|announced|stated/gi;
  const attributionMatches = storyContent.match(attributionPatterns);
  if (attributionMatches && attributionMatches.length >= 2) score += 0.25;
  else if (attributionMatches && attributionMatches.length >= 1) score += 0.15;

  // Markdown structure (headings, bold) suggests original composition
  if (/^##\s/m.test(storyContent)) score += 0.15;
  if (/\*\*[^*]+\*\*/.test(storyContent)) score += 0.1;

  // Local context references suggest original perspective
  const localContextPatterns = /locals|community|residents|neighborhood|visitors|tourists/gi;
  const localMatches = storyContent.match(localContextPatterns);
  if (localMatches && localMatches.length >= 1) score += 0.2;

  return Math.min(score, 1.0);
}

/**
 * Calculate quality score for a news article
 */
export function calculateQualityScore(
  content: NewsContentOutput,
  newsworthiness: number = 0.5
): QualityScore {
  const factors = content.qualityFactors;

  const breakdown = {
    sourceCount: Math.min(factors.sourceCount / 3, 1.0) * WEIGHTS.sourceCount,
    dalatRelevance: factors.dalatRelevance * WEIGHTS.dalatRelevance,
    newsworthiness: newsworthiness * WEIGHTS.newsworthiness,
    contentLength: Math.min(factors.contentLength / 400, 1.0) * WEIGHTS.contentLength,
    hasDates: (factors.hasDates ? 1.0 : 0.0) * WEIGHTS.hasDates,
    hasNamedSources: (factors.hasNamedSources ? 1.0 : 0.0) * WEIGHTS.hasNamedSources,
    hasImages: (factors.hasImages ? 1.0 : 0.0) * WEIGHTS.hasImages,
    originality: estimateOriginality(content.storyContent, factors.sourceCount) * WEIGHTS.originality,
  };

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  let suggestedStatus: QualityScore['suggestedStatus'];
  if (total >= 0.75) {
    suggestedStatus = 'published';
  } else if (total >= 0.50) {
    suggestedStatus = 'experimental';
  } else {
    suggestedStatus = 'draft';
  }

  return { total, breakdown, suggestedStatus };
}
