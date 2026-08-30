import { describe, expect, it } from 'vitest';
import {
  evaluateNewsFreshness,
  freshnessQueueStatus,
  newestSourcePublication,
  resolveEditorialPublicationCandidate,
} from './freshness-policy';

const NOW = new Date('2026-08-30T12:00:00.000Z');

describe('news freshness publication gate', () => {
  it('allows genuinely recent reporting', () => {
    const decision = evaluateNewsFreshness('2026-08-28T13:00:00.000Z', NOW);
    expect(decision.disposition).toBe('fresh');
    expect(decision.autoPublishEligible).toBe(true);
    expect(freshnessQueueStatus(decision)).toBe('pending');
  });

  it('holds 3-7 day reporting for an editor', () => {
    const decision = evaluateNewsFreshness('2026-08-26T12:00:00.000Z', NOW);
    expect(decision.disposition).toBe('needs-review');
    expect(freshnessQueueStatus(decision)).toBe('review');
  });

  it('quarantines historical reporting instead of making it look new', () => {
    const decision = evaluateNewsFreshness('2026-04-13T12:35:00.000Z', NOW);
    expect(decision.disposition).toBe('historical');
    expect(decision.autoPublishEligible).toBe(false);
    expect(freshnessQueueStatus(decision)).toBe('skipped');
  });

  it('holds missing and implausibly future dates', () => {
    expect(evaluateNewsFreshness(null, NOW).disposition).toBe('missing-date');
    expect(evaluateNewsFreshness('2026-09-01T12:00:00.000Z', NOW).disposition).toBe('future-date');
  });

  it('uses the newest corroborating source as the story news peg', () => {
    expect(newestSourcePublication([
      '2026-08-28T10:00:00Z',
      '2026-08-29T09:30:00Z',
      null,
    ])).toBe('2026-08-29T09:30:00.000Z');
  });

  it('never lets an AI editorial approval override stale evidence', () => {
    expect(resolveEditorialPublicationCandidate({
      freshness: evaluateNewsFreshness('2026-04-13T12:35:00.000Z', NOW),
      review: { disposition: 'current-news', dalatRelevance: 1, newsworthiness: 1 },
      verificationStatus: 'published',
      existingUrl: false,
    })).toBe('draft');
  });

  it('requires fresh evidence, editorial approval, and verification', () => {
    const freshness = evaluateNewsFreshness('2026-08-30T10:00:00.000Z', NOW);
    expect(resolveEditorialPublicationCandidate({
      freshness,
      review: { disposition: 'evergreen', dalatRelevance: 1, newsworthiness: 0.8 },
      verificationStatus: 'published',
      existingUrl: false,
    })).toBe('draft');
    expect(resolveEditorialPublicationCandidate({
      freshness,
      review: { disposition: 'current-news', dalatRelevance: 1, newsworthiness: 0.8 },
      verificationStatus: 'published',
      existingUrl: false,
    })).toBe('published');
  });
});
