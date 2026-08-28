import { describe, expect, it } from 'vitest';
import {
  LINKED_SOURCE_REVERIFY_BATCH_SIZE,
  buildReverificationFailureUpdate,
  buildReverificationSuccessUpdate,
} from './reverification';
import type { ScrapedArticle } from './types';

const ATTEMPTED_AT = '2026-08-27T12:00:00.000Z';

const refreshedArticle: ScrapedArticle = {
  sourceId: 'tuoitre',
  sourceUrl: 'https://tuoitre.vn/corrected-story-123.htm',
  sourceName: 'Tuổi Trẻ',
  title: 'Corrected story',
  content: 'The corrected source snapshot.',
  imageUrls: ['https://tuoitre.vn/corrected.jpg'],
  publishedAt: null,
  retrievedAt: ATTEMPTED_AT,
};

describe('linked-source reverification updates', () => {
  it('keeps the batch bounded to five rows', () => {
    expect(LINKED_SOURCE_REVERIFY_BATCH_SIZE).toBe(5);
  });

  it('refreshes the snapshot and requeues processing without touching blog_post_id', () => {
    const update = buildReverificationSuccessUpdate(
      refreshedArticle,
      ATTEMPTED_AT,
      '2026-07-01T08:00:00.000Z'
    );

    expect(update).toMatchObject({
      title: refreshedArticle.title,
      content: refreshedArticle.content,
      scraped_at: ATTEMPTED_AT,
      processed_at: null,
      status: 'pending',
      error_message: null,
      published_at: '2026-07-01T08:00:00.000Z',
    });
    expect(update).not.toHaveProperty('blog_post_id');
  });

  it('keeps the last known source image when a refresh exposes no image', () => {
    const update = buildReverificationSuccessUpdate(
      { ...refreshedArticle, imageUrls: [] },
      ATTEMPTED_AT,
      null,
      ['https://tuoitre.vn/last-known.jpg']
    );

    expect(update.image_urls).toEqual(['https://tuoitre.vn/last-known.jpg']);
  });

  it('records a failed attempt without replacing the last good snapshot', () => {
    const update = buildReverificationFailureUpdate(
      ATTEMPTED_AT,
      'upstream returned no parseable article'
    );

    expect(update).toEqual({
      processed_at: ATTEMPTED_AT,
      status: 'processed',
      error_message: '[reverify] upstream returned no parseable article',
    });
    expect(update).not.toHaveProperty('scraped_at');
    expect(update).not.toHaveProperty('content');
    expect(update).not.toHaveProperty('blog_post_id');
  });
});
