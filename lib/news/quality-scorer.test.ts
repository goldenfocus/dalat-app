import { describe, expect, it } from 'vitest';
import { calculateQualityScore, NEWS_AUTO_PUBLISH_THRESHOLD } from './quality-scorer';
import type {
  ClaimCandidate,
  ClaimExtractionSource,
  NewsContentOutput,
  VerifiedClaimLedger,
} from './types';
import { buildVerifiedClaimLedger } from './verification';

const NOW = new Date('2026-08-27T12:00:00.000Z');

function source(
  sourceIndex: number,
  text: string,
  overrides: Partial<ClaimExtractionSource> = {}
): ClaimExtractionSource {
  return {
    sourceIndex,
    sourceId: `source-${sourceIndex}`,
    sourceUrl: `https://publisher-${sourceIndex}.example/story`,
    publisher: `Publisher ${sourceIndex}`,
    tier: 'B',
    title: `Publisher ${sourceIndex} story`,
    text,
    publishedAt: '2026-08-27T08:00:00.000Z',
    retrievedAt: '2026-08-27T09:00:00.000Z',
    ...overrides,
  };
}

function claim(sourceIndex: number, evidenceFragment: string): ClaimCandidate {
  return {
    sourceIndex,
    key: 'venue.capacity',
    value: '500',
    confidence: 0.95,
    evidenceFragment,
  };
}

function content(verification: VerifiedClaimLedger): NewsContentOutput {
  return {
    title: 'Capacity confirmed',
    storyContent: 'The venue capacity is 500.',
    technicalContent: '',
    metaDescription: '',
    seoKeywords: [],
    suggestedSlug: 'capacity-confirmed',
    newsTags: [],
    newsTopic: 'Capacity',
    imageDescriptions: [],
    sourceUrls: [],
    internalLinks: [],
    verification,
    qualityFactors: {
      sourceCount: verification.acceptedClaims.length,
      hasDates: true,
      hasNamedSources: true,
      hasImages: true,
      contentLength: 500,
      dalatRelevance: 1,
    },
  };
}

describe('verification-based publication score', () => {
  it('keeps a single fresh Tier B source in draft despite polished presentation fields', () => {
    const sources = [source(1, 'The venue capacity is 500 guests.')];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'The venue capacity is 500 guests'),
    ], sources, NOW);
    const quality = calculateQualityScore(content(ledger), 1);

    expect(ledger.metrics.sourceQuality).toBe(0.9);
    expect(ledger.metrics.corroboration).toBe(0);
    expect(quality.total).toBeLessThan(NEWS_AUTO_PUBLISH_THRESHOLD);
    expect(quality.suggestedStatus).toBe('draft');
    expect(quality.suggestedStatus).not.toBe('experimental');
  });

  it('publishes when two fresh Tier B sources independently corroborate the fact', () => {
    const sources = [
      source(1, 'The venue capacity is 500 guests.'),
      source(2, 'The listed venue capacity is 500 guests.'),
    ];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'The venue capacity is 500 guests'),
      claim(2, 'The listed venue capacity is 500 guests'),
    ], sources, NOW);
    const quality = calculateQualityScore(content(ledger));

    expect(ledger.factGroups[0].sourceUrls).toHaveLength(2);
    expect(ledger.metrics.corroboration).toBe(1);
    expect(quality.total).toBeGreaterThanOrEqual(NEWS_AUTO_PUBLISH_THRESHOLD);
    expect(quality.suggestedStatus).toBe('published');
  });

  it('publishes a fresh fact directly supported by one Tier A official source', () => {
    const sources = [source(1, 'The venue capacity is 500 guests.', {
      sourceId: 'dalat-government',
      publisher: 'Da Lat government',
      tier: 'A',
    })];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'The venue capacity is 500 guests'),
    ], sources, NOW);
    const quality = calculateQualityScore(content(ledger));

    expect(ledger.metrics.corroboration).toBe(1);
    expect(quality.suggestedStatus).toBe('published');
  });

  it('does not count two URLs from the same publisher as independent corroboration', () => {
    const sources = [
      source(1, 'The venue capacity is 500 guests.', { publisher: 'Same Newsroom' }),
      source(2, 'The listed venue capacity is 500 guests.', { publisher: 'same newsroom' }),
    ];
    const ledger = buildVerifiedClaimLedger([
      claim(1, 'The venue capacity is 500 guests'),
      claim(2, 'The listed venue capacity is 500 guests'),
    ], sources, NOW);
    const quality = calculateQualityScore(content(ledger));

    expect(ledger.metrics.corroboration).toBe(0);
    expect(quality.suggestedStatus).toBe('draft');
  });
});
