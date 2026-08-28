import { describe, expect, it } from 'vitest';
import type { VerifiedClaimLedger } from './types';
import { renderVerifiedNews } from './verified-renderer';
import { validateGeneratedContent } from './verification';

function ledger(): VerifiedClaimLedger {
  return {
    acceptedClaims: [
      {
        id: 'claim-1',
        sourceIndex: 1,
        sourceId: 'tuoitre',
        sourceUrl: 'https://tuoitre.vn/story.htm',
        publisher: 'Tuổi Trẻ',
        sourceTier: 'B',
        key: 'venue.name',
        value: 'Tháng Năm homestay',
        normalizedKey: 'venue.name',
        normalizedValue: 'tháng năm homestay',
        confidence: 0.98,
        retrievedAt: '2026-08-28T00:00:00.000Z',
        publishedAt: '2026-04-13T12:35:00.000Z',
        evidenceFragment: 'Tháng Năm homestay',
      },
      {
        id: 'claim-2',
        sourceIndex: 1,
        sourceId: 'tuoitre',
        sourceUrl: 'https://tuoitre.vn/story.htm',
        publisher: 'Tuổi Trẻ',
        sourceTier: 'B',
        key: 'event.start_date',
        value: '2026-04-30',
        normalizedKey: 'event.start_date',
        normalizedValue: '2026-04-30',
        confidence: 0.97,
        retrievedAt: '2026-08-28T00:00:00.000Z',
        publishedAt: '2026-04-13T12:35:00.000Z',
        evidenceFragment: '30/04/2026',
      },
    ],
    rejectedClaims: [],
    factGroups: [
      {
        id: 'fact-1',
        normalizedKey: 'event.start_date',
        normalizedValue: '2026-04-30',
        value: '2026-04-30',
        claimIds: ['claim-2'],
        sourceIndexes: [1],
        sourceUrls: ['https://tuoitre.vn/story.htm'],
        confidence: 0.97,
      },
      {
        id: 'fact-2',
        normalizedKey: 'venue.name',
        normalizedValue: 'tháng năm homestay',
        value: 'Tháng Năm homestay',
        claimIds: ['claim-1'],
        sourceIndexes: [1],
        sourceUrls: ['https://tuoitre.vn/story.htm'],
        confidence: 0.98,
      },
    ],
    candidateCount: 2,
    conflictingKeyCount: 0,
    metrics: {
      sourceQuality: 0.9,
      corroboration: 0,
      extractionSupport: 0.975,
      freshness: 0.5,
      agreement: 1,
    },
  };
}

describe('fail-closed verified news renderer', () => {
  it('publishes only fixed labels and byte-for-byte accepted values', () => {
    const verification = ledger();
    const rendered = renderVerifiedNews(verification);

    expect(rendered.title).toBe('Venue name: Tháng Năm homestay');
    expect(rendered.storyContent).toContain('**Event start date:** 2026-04-30');
    expect(rendered.storyContent).toContain('**Venue name:** Tháng Năm homestay');
    expect(rendered.storyContent).not.toMatch(/Sunny Sky|Tet|summer|popular|owner/iu);
    expect(validateGeneratedContent({
      title: rendered.title,
      storyContent: rendered.storyContent,
      technicalContent: rendered.technicalContent,
      metaDescription: rendered.metaDescription,
      additionalText: [rendered.newsTopic],
    }, verification)).toEqual([]);
  });

  it('refuses to render an empty ledger', () => {
    const empty = ledger();
    empty.acceptedClaims = [];
    empty.factGroups = [];
    expect(() => renderVerifiedNews(empty)).toThrow('empty verified fact ledger');
  });
});
