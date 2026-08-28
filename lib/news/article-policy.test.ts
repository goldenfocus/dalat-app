import { describe, expect, it } from 'vitest';
import {
  acceptedFactsHaveChanged,
  buildAcceptedFactFingerprint,
  getAcceptedFactFingerprint,
  getBlogTranslationCutoff,
  getNewsContentUpdatedAt,
  getNewsPageModifiedAt,
  isCurrentBlogTranslationForBatch,
  isTranslationAtOrAfterCutoff,
  mergeSourceRecords,
  resolveNewsPublishedAt,
  resolveNewsPublicationStatus,
  stampExistingNewsContentRevision,
  stampNewsSourceEnvelope,
} from './article-policy';
import type { NewsSourceProvenance } from './types';

function source(url: string, retrievedAt: string): NewsSourceProvenance {
  return {
    url,
    title: 'Source title',
    publisher: 'Publisher',
    published_at: '2026-08-27T08:00:00.000Z',
    tier: 'B',
    retrieved_at: retrievedAt,
    claims: [],
  };
}

describe('durable news article policy', () => {
  it('fingerprints accepted facts independently of source and fact ordering', async () => {
    const first = await buildAcceptedFactFingerprint([
      { normalizedKey: 'venue.capacity', normalizedValue: '500' },
      { normalizedKey: 'event.start_date', normalizedValue: '2026-09-12' },
    ]);
    const reorderedWithDuplicate = await buildAcceptedFactFingerprint([
      { normalizedKey: 'event.start_date', normalizedValue: '2026-09-12' },
      { normalizedKey: 'venue.capacity', normalizedValue: '500' },
      { normalizedKey: 'venue.capacity', normalizedValue: '500' },
    ]);

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(reorderedWithDuplicate).toBe(first);
  });

  it('changes the fingerprint when an accepted fact materially changes', async () => {
    const before = await buildAcceptedFactFingerprint([
      { normalizedKey: 'venue.capacity', normalizedValue: '500' },
    ]);
    const after = await buildAcceptedFactFingerprint([
      { normalizedKey: 'venue.capacity', normalizedValue: '700' },
    ]);

    expect(after).not.toBe(before);
  });

  it('forces one cleanup pass for legacy, malformed, or mixed source envelopes', async () => {
    const fingerprint = await buildAcceptedFactFingerprint([
      { normalizedKey: 'venue.capacity', normalizedValue: '500' },
    ]);

    expect(acceptedFactsHaveChanged([{ url: 'https://legacy.example' }], fingerprint)).toBe(true);
    expect(getAcceptedFactFingerprint([
      { accepted_fact_fingerprint: fingerprint },
      { accepted_fact_fingerprint: `sha256:${'0'.repeat(64)}` },
    ])).toBeNull();
    expect(acceptedFactsHaveChanged([
      { accepted_fact_fingerprint: fingerprint },
      { accepted_fact_fingerprint: fingerprint },
    ], fingerprint)).toBe(false);
  });

  it('refuses to create a revision identity with no accepted facts', async () => {
    await expect(buildAcceptedFactFingerprint([])).rejects.toThrow(
      'Cannot fingerprint an empty accepted fact set'
    );
  });

  it('keeps an established public URL reachable when reverification is below threshold', () => {
    expect(resolveNewsPublicationStatus('published', 'draft')).toBe('experimental');
    expect(resolveNewsPublicationStatus('experimental', 'draft')).toBe('experimental');
  });

  it('publishes a new or established article only after the confidence gate passes', () => {
    expect(resolveNewsPublicationStatus('draft', 'published')).toBe('published');
    expect(resolveNewsPublicationStatus('experimental', 'published')).toBe('published');
    expect(resolveNewsPublicationStatus(null, 'draft')).toBe('draft');
  });

  it('never automatically reactivates a deliberately removed article', () => {
    expect(resolveNewsPublicationStatus('archived', 'published')).toBe('archived');
    expect(resolveNewsPublicationStatus('deprecated', 'published')).toBe('deprecated');
  });

  it('dates only a genuine first publication and never redates a public correction', () => {
    const now = '2026-08-28T12:00:00.000Z';
    expect(resolveNewsPublishedAt(null, 'published', now)).toBe(now);
    expect(resolveNewsPublishedAt({ status: 'draft', published_at: null }, 'published', now)).toBe(now);
    expect(resolveNewsPublishedAt({ status: 'experimental', published_at: null }, 'published', now)).toBeNull();
    expect(resolveNewsPublishedAt({
      status: 'published',
      published_at: '2026-08-20T00:00:00.000Z',
    }, 'published', now)).toBe('2026-08-20T00:00:00.000Z');
  });

  it('updates provenance for the same source URL without losing other sources', () => {
    const merged = mergeSourceRecords(
      [source('https://one.example/story', '2026-08-20T00:00:00.000Z')],
      [
        source('https://one.example/story', '2026-08-27T00:00:00.000Z'),
        source('https://two.example/story', '2026-08-27T01:00:00.000Z'),
      ]
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      url: 'https://one.example/story',
      retrieved_at: '2026-08-27T00:00:00.000Z',
    });
  });

  it('reads the latest factual revision marker without trusting invalid JSON values', () => {
    expect(getNewsContentUpdatedAt([
      { content_updated_at: '2026-08-26T00:00:00.000Z' },
      { content_updated_at: 'not-a-date' },
      { content_updated_at: '2026-08-27T00:00:00.000Z' },
    ])).toBe('2026-08-27T00:00:00.000Z');
  });

  it('uses the factual marker instead of generic row churn for modern news', () => {
    expect(getBlogTranslationCutoff({
      source: 'news_scrape',
      source_urls: [{ content_updated_at: '2026-08-27T03:00:00.000Z' }],
      updated_at: '2026-08-27T04:00:00.000Z',
    })).toBe('2026-08-27T03:00:00.000Z');

    expect(getBlogTranslationCutoff({
      source: 'news_scrape',
      source_urls: [{ content_updated_at: '2026-08-27T05:00:00.000Z' }],
      updated_at: '2026-08-27T04:00:00.000Z',
    })).toBe('2026-08-27T05:00:00.000Z');
  });

  it('uses the newest factual or visible-row revision for crawler freshness', () => {
    expect(getNewsPageModifiedAt({
      source_urls: [{ content_updated_at: '2026-08-27T03:00:00.000Z' }],
      updated_at: '2026-08-27T04:00:00.000Z',
    })).toBe('2026-08-27T04:00:00.000Z');
    expect(getNewsPageModifiedAt({
      source_urls: [{ content_updated_at: '2026-08-27T05:00:00.000Z' }],
      updated_at: '2026-08-27T04:00:00.000Z',
    })).toBe('2026-08-27T05:00:00.000Z');
  });

  it('uses the live row revision for source-free automation and manual posts', () => {
    expect(getBlogTranslationCutoff({
      source: 'news_scrape',
      source_urls: [],
      updated_at: '2026-08-27T06:00:00.000Z',
    })).toBe('2026-08-27T06:00:00.000Z');
    expect(getBlogTranslationCutoff({
      source: 'manual',
      source_urls: [{ content_updated_at: '2026-08-27T07:00:00.000Z' }],
      updated_at: '2026-08-27T08:00:00.000Z',
    })).toBe('2026-08-27T08:00:00.000Z');
  });

  it('rejects stale and invalid translation timestamps at a factual cutoff', () => {
    const cutoff = '2026-08-27T09:00:00.000Z';
    expect(isTranslationAtOrAfterCutoff('2026-08-27T08:59:59.999Z', cutoff)).toBe(false);
    expect(isTranslationAtOrAfterCutoff(cutoff, cutoff)).toBe(true);
    expect(isTranslationAtOrAfterCutoff('not-a-date', cutoff)).toBe(false);
    expect(isTranslationAtOrAfterCutoff('not-a-date', null)).toBe(true);
  });

  it('fails batch translations closed when current row metadata is absent', () => {
    const cutoffs = new Map([
      ['current', '2026-08-27T09:00:00.000Z'],
      ['legacy', null],
    ]);
    expect(isCurrentBlogTranslationForBatch(
      'current',
      '2026-08-27T09:00:00.000Z',
      cutoffs
    )).toBe(true);
    expect(isCurrentBlogTranslationForBatch(
      'current',
      '2026-08-27T08:59:59.999Z',
      cutoffs
    )).toBe(false);
    expect(isCurrentBlogTranslationForBatch(
      'missing',
      '2026-08-28T09:00:00.000Z',
      cutoffs
    )).toBe(false);
    expect(isCurrentBlogTranslationForBatch('legacy', 'not-a-date', cutoffs)).toBe(true);
  });

  it('stamps a consistent fingerprint and body revision across merged sources', async () => {
    const fingerprint = await buildAcceptedFactFingerprint([
      { normalizedKey: 'venue.capacity', normalizedValue: '500' },
    ]);
    const stamped = stampNewsSourceEnvelope(
      mergeSourceRecords(
        [source('https://one.example/story', '2026-08-20T00:00:00.000Z')],
        [source('https://two.example/story', '2026-08-27T01:00:00.000Z')]
      ),
      fingerprint,
      '2026-08-27T02:00:00.000Z'
    );

    expect(getAcceptedFactFingerprint(stamped)).toBe(fingerprint);
    expect(stamped).toHaveLength(2);
    expect(stamped.every((record) =>
      record.content_updated_at === '2026-08-27T02:00:00.000Z'
    )).toBe(true);
  });

  it('advances an editor-approved content revision without changing source identity', () => {
    const sources = [{
      url: 'https://source.example/story',
      accepted_fact_fingerprint: `sha256:${'a'.repeat(64)}`,
      content_updated_at: '2026-08-20T00:00:00.000Z',
    }];
    expect(stampExistingNewsContentRevision(
      sources,
      '2026-08-28T00:00:00.000Z'
    )).toEqual([{
      ...sources[0],
      content_updated_at: '2026-08-28T00:00:00.000Z',
    }]);
  });
});
