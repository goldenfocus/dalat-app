import type { ScrapedArticle } from './types';

/** Twice-daily cron: five rows keeps source load and runtime tightly bounded. */
export const LINKED_SOURCE_REVERIFY_BATCH_SIZE = 5;
export const LINKED_SOURCE_REVERIFY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface ReverificationSuccessUpdate {
  source_id: string;
  source_name: string;
  title: string;
  content: string;
  image_urls: string[];
  published_at: string | null;
  scraped_at: string;
  processed_at: null;
  status: 'pending';
  error_message: null;
}

export interface ReverificationFailureUpdate {
  processed_at: string;
  status: 'processed';
  error_message: string;
}

/**
 * Requeue the existing raw row while deliberately omitting blog_post_id so the
 * news processor updates the already-linked public article in place.
 */
export function buildReverificationSuccessUpdate(
  article: ScrapedArticle,
  attemptedAt: string,
  previousPublishedAt: string | null,
  previousImageUrls: string[] = []
): ReverificationSuccessUpdate {
  return {
    source_id: article.sourceId,
    source_name: article.sourceName,
    title: article.title,
    content: article.content,
    image_urls: article.imageUrls.length > 0 ? article.imageUrls : previousImageUrls,
    published_at: article.publishedAt ?? previousPublishedAt,
    scraped_at: attemptedAt,
    processed_at: null,
    status: 'pending',
    error_message: null,
  };
}

/**
 * Record a failed verification attempt without replacing the last good source
 * snapshot. In particular, this payload has no scraped_at or content fields.
 */
export function buildReverificationFailureUpdate(
  attemptedAt: string,
  reason: string
): ReverificationFailureUpdate {
  const conciseReason = reason.replace(/\s+/g, ' ').trim().slice(0, 300) || 'fetch or parse failed';
  return {
    processed_at: attemptedAt,
    status: 'processed',
    error_message: `[reverify] ${conciseReason}`,
  };
}
