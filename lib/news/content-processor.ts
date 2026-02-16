/**
 * AI content processor for DaLat News
 * Takes clustered articles and generates original blog posts
 */

import Anthropic from '@anthropic-ai/sdk';
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
  const client = new Anthropic();

  const articles = cluster.articles.map(a => ({
    title: a.title,
    content: a.content,
    sourceName: a.sourceName,
    sourceUrl: a.sourceUrl,
  }));

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: NEWS_REWRITE_SYSTEM,
        messages: [{
          role: 'user',
          content: buildRewritePrompt(articles),
        }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const parsed = parseJsonResponse(textContent.text);

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

      // Check if this is a retryable error (rate limit or server error)
      const isRateLimited = lastError.message.includes('rate_limit') ||
        lastError.message.includes('429') ||
        lastError.message.includes('overloaded');
      const isServerError = lastError.message.includes('500') ||
        lastError.message.includes('503') ||
        lastError.message.includes('529');

      if ((isRateLimited || isServerError) && attempt < MAX_RETRIES - 1) {
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
