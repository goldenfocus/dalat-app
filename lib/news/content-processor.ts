/**
 * AI content processor for DaLat News
 * Takes clustered articles and generates original blog posts
 */

import { aiChat } from '@/lib/ai/provider';
import type { ArticleCluster, NewsContentOutput } from './types';
import { NEWS_REWRITE_SYSTEM, buildRewritePrompt } from './news-prompt';

/** Maximum retries for transient API errors */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff (ms) */
const BASE_DELAY_MS = 2000;

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse JSON from Claude's response, stripping markdown code fences if present
 */
function parseJsonResponse(text: string): Record<string, unknown> {
  let jsonText = text.trim();

  // Strip markdown code fences
  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
  else if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  // Try parsing directly
  try {
    return JSON.parse(jsonText);
  } catch {
    // Try to extract JSON object from the response (sometimes Claude adds preamble)
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error(`Failed to parse JSON from response: ${jsonText.slice(0, 200)}...`);
  }
}

/**
 * Generate original news content from a cluster of source articles
 */
export async function processNewsCluster(
  cluster: ArticleCluster
): Promise<NewsContentOutput> {
  const articles = cluster.articles.map(a => ({
    title: a.title,
    content: a.content,
    sourceName: a.sourceName,
    sourceUrl: a.sourceUrl,
  }));

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const responseText = await aiChat({
        system: NEWS_REWRITE_SYSTEM,
        prompt: buildRewritePrompt(articles),
        json: true,
        maxTokens: 3000,
        temperature: 0.5,
        timeoutMs: 180_000, // long generation on the local model
      });

      const parsed = parseJsonResponse(responseText);

      // Build source URLs array
      const sourceUrls = cluster.articles.map(a => ({
        url: a.sourceUrl,
        title: a.title,
        publisher: a.sourceName,
        published_at: a.publishedAt,
      }));

      const storyContent = (parsed.story_content as string) || '';

      return {
        title: (parsed.title as string) || cluster.articles[0].title,
        storyContent,
        technicalContent: (parsed.technical_content as string) || '',
        metaDescription: (parsed.meta_description as string) || '',
        seoKeywords: (parsed.seo_keywords as string[]) || [],
        suggestedSlug: (parsed.suggested_slug as string) || '',
        newsTags: (parsed.news_tags as string[]) || [],
        newsTopic: (parsed.news_topic as string) || cluster.keywords.join(', '),
        imageDescriptions: (parsed.image_descriptions as string[]) || [],
        sourceUrls,
        internalLinks: (parsed.internal_links as Array<{ text: string; url: string; type: 'event' | 'venue' | 'location' }>) || [],
        qualityFactors: {
          sourceCount: cluster.articles.length,
          hasDates: cluster.articles.some(a => !!a.publishedAt),
          hasNamedSources: /according to|said|told|reported/i.test(storyContent),
          hasImages: cluster.articles.some(a => a.imageUrls.length > 0),
          contentLength: storyContent.length,
          dalatRelevance: 0.8, // Placeholder, will be scored by quality-scorer
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // The provider chain already fell back across all free providers,
      // so any error here is worth a backoff-and-retry (transient rate
      // limits on free tiers, JSON parse hiccups).
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[content-processor] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms: ${lastError.message}`);
        await sleep(delay);
        continue;
      }

      // Non-retryable error or last attempt
      break;
    }
  }

  throw lastError || new Error('processNewsCluster failed with unknown error');
}
