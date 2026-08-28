import { describe, expect, it } from 'vitest';
import {
  auditLegacyRecovery,
  LEGACY_RECOVERY_BATCH_SIZE,
  LEGACY_RECOVERY_URL_LIMIT,
} from './legacy-recovery';

describe('legacy automated article recovery', () => {
  it('classifies source-free work and maps registered legacy URLs to the existing post', () => {
    const audit = auditLegacyRecovery([
      { id: 'linked', slug: 'already-linked', source_urls: [] },
      { id: 'source-free', slug: 'keep-this-url', source_urls: [] },
      {
        id: 'legacy-string',
        slug: 'old-slug-stays',
        source_urls: [
          'https://thanhnien.vn/a-real-story.htm',
          'https://unregistered.example/a-story',
        ],
      },
      {
        id: 'legacy-object',
        slug: 'old-object-slug',
        source_urls: [{ url: 'https://tuoitre.vn/a-real-story.htm' }],
      },
    ], new Map([['linked', new Set(['https://already.example/source'])]]));

    expect(audit).toMatchObject({
      unlinkedPosts: 3,
      sourceFreePosts: 1,
      sourceBackedPosts: 2,
      registeredSourceUrls: 2,
      unregisteredSourceUrls: 1,
    });
    expect(audit.candidates).toEqual([
      {
        blogPostId: 'legacy-string',
        slug: 'old-slug-stays',
        sourceId: 'thanhnien',
        sourceUrl: 'https://thanhnien.vn/a-real-story.htm',
      },
      {
        blogPostId: 'legacy-object',
        slug: 'old-object-slug',
        sourceId: 'tuoitre',
        sourceUrl: 'https://tuoitre.vn/a-real-story.htm',
      },
    ]);
  });

  it('keeps the automatic recovery batch tightly bounded', () => {
    const posts = Array.from({ length: 10 }, (_, index) => ({
      id: `post-${index}`,
      slug: `slug-${index}`,
      source_urls: [`https://thanhnien.vn/story-${index}.htm`],
    }));
    const audit = auditLegacyRecovery(posts, new Map());

    expect(LEGACY_RECOVERY_BATCH_SIZE).toBe(3);
    expect(audit.candidates).toHaveLength(3);
    expect(audit.registeredSourceUrls).toBe(10);
  });

  it('keeps every registered source for a selected legacy post', () => {
    const audit = auditLegacyRecovery([
      {
        id: 'two-source-post',
        slug: 'preserved-two-source-url',
        source_urls: [
          'https://thanhnien.vn/first.htm',
          'https://tuoitre.vn/second.htm',
        ],
      },
      {
        id: 'next-post',
        slug: 'next',
        source_urls: ['https://thanhnien.vn/third.htm'],
      },
    ], new Map(), 1);

    expect(audit.candidates).toHaveLength(2);
    expect(new Set(audit.candidates.map((candidate) => candidate.blogPostId)))
      .toEqual(new Set(['two-source-post']));
  });

  it('enforces a hard URL-attempt cap even when one post stores many sources', () => {
    const audit = auditLegacyRecovery([{
      id: 'many-sources',
      slug: 'same-established-url',
      source_urls: Array.from(
        { length: LEGACY_RECOVERY_URL_LIMIT + 4 },
        (_, index) => `https://thanhnien.vn/story-${index}.htm`
      ),
    }], new Map());

    expect(audit.candidates).toHaveLength(LEGACY_RECOVERY_URL_LIMIT);
  });

  it('quarantines a source URL claimed by multiple public posts', () => {
    const shared = 'https://thanhnien.vn/shared-source.htm';
    const audit = auditLegacyRecovery([
      { id: 'first', slug: 'first-url', source_urls: [shared] },
      { id: 'second', slug: 'second-url', source_urls: [{ url: shared }] },
    ], new Map());

    expect(audit.ambiguousSourceUrls).toBe(1);
    expect(audit.candidates).toEqual([]);
  });
});
