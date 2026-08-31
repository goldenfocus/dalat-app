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

  it('publishes a fresh routine bulletin with three exact facts from one Tier B newsroom', () => {
    const evidence = [
      'Tourism attendance reached 1,000 visitors.',
      'The tourism economy reported revenue of 45.600 billion VND.',
      'Tỷ lệ đặt phòng du lịch tăng 40%.',
    ].join(' ');
    const sources = [source(1, evidence)];
    const ledger = buildVerifiedClaimLedger([
      { ...claim(1, 'Tourism attendance reached 1,000 visitors'), key: 'tourism.attendance', value: '1,000 visitors' },
      { ...claim(1, 'The tourism economy reported revenue of 45.600 billion VND'), key: 'economy.amount', value: '45.600 billion VND' },
      { ...claim(1, 'Tỷ lệ đặt phòng du lịch tăng 40%'), key: 'tourism.percentage', value: '40%' },
    ], sources, NOW);
    const quality = calculateQualityScore(content(ledger));

    expect(ledger.factGroups).toHaveLength(3);
    expect(ledger.metrics.corroboration).toBe(0);
    expect(quality.total).toBeLessThan(NEWS_AUTO_PUBLISH_THRESHOLD);
    expect(quality.suggestedStatus).toBe('published');
  });

  it('publishes a concise routine bulletin with two high-confidence exact facts', () => {
    const evidence = [
      'Lâm Đồng đón hơn 16,46 triệu lượt khách.',
      'Doanh thu du lịch đạt 45.600 tỉ đồng.',
    ].join(' ');
    const sources = [source(1, evidence)];
    const ledger = buildVerifiedClaimLedger([
      { ...claim(1, 'Lâm Đồng đón hơn 16,46 triệu lượt khách'), key: 'tourism.attendance', value: '16,46 triệu lượt khách' },
      { ...claim(1, 'Doanh thu du lịch đạt 45.600 tỉ đồng'), key: 'economy.amount', value: '45.600 tỉ đồng' },
    ], sources, NOW);

    expect(ledger.factGroups).toHaveLength(2);
    expect(calculateQualityScore(content(ledger)).suggestedStatus).toBe('published');
  });

  it('keeps a single-source sensitive bulletin in draft even with three exact facts', () => {
    const evidence = [
      'The incident count was 3.',
      'The incident was located at Xuân Hương Lake.',
      'The incident date was 27/08/2026.',
    ].join(' ');
    const sources = [source(1, evidence)];
    const ledger = buildVerifiedClaimLedger([
      { ...claim(1, 'The incident count was 3'), key: 'incident.count', value: '3' },
      { ...claim(1, 'The incident was located at Xuân Hương Lake'), key: 'incident.location', value: 'Xuân Hương Lake' },
      { ...claim(1, 'The incident date was 27/08/2026'), key: 'incident.date', value: '2026-08-27' },
    ], sources, NOW);
    const quality = calculateQualityScore(content(ledger));

    expect(ledger.factGroups).toHaveLength(3);
    expect(quality.suggestedStatus).toBe('draft');
  });
});
