/**
 * Topic clustering for news articles
 * Groups articles about the same story using AI-extracted keywords
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ScrapedArticle, ArticleCluster } from './types';
import { NEWS_CLUSTERING_SYSTEM, buildClusteringPrompt } from './news-prompt';

interface ClusteringResult {
  keywords: string[];
  topic: string;
  dalat_relevance: number;
  newsworthiness: number;
}

/** Maximum retries for transient API errors */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff (ms) */
const BASE_DELAY_MS = 1000;
/** Delay between API calls to respect rate limits (ms) */
const INTER_CALL_DELAY_MS = 200;

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse JSON from Claude's response, stripping markdown code fences if present
 */
function parseJsonResponse(text: string): ClusteringResult {
  let jsonText = text.trim();

  // Strip markdown code fences
  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
  else if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  try {
    return JSON.parse(jsonText) as ClusteringResult;
  } catch {
    // Try to extract JSON object from the response
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ClusteringResult;
    }
    throw new Error(`Failed to parse clustering JSON: ${jsonText.slice(0, 200)}`);
  }
}

/**
 * Extract topic keywords from a single article using Claude Haiku
 * Includes retry logic for rate limits and transient errors
 */
async function extractTopicKeywords(
  client: Anthropic,
  article: ScrapedArticle
): Promise<ClusteringResult | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: NEWS_CLUSTERING_SYSTEM,
        messages: [{
          role: 'user',
          content: buildClusteringPrompt(article.title, article.content),
        }],
      });

      const text = response.content.find(c => c.type === 'text');
      if (!text || text.type !== 'text') return null;

      const result = parseJsonResponse(text.text);

      // Validate required fields
      if (!Array.isArray(result.keywords) || result.keywords.length === 0) {
        console.warn(`[clusterer] No keywords extracted for: ${article.title}`);
        return null;
      }
      if (typeof result.dalat_relevance !== 'number') {
        result.dalat_relevance = 0.5;
      }
      if (typeof result.newsworthiness !== 'number') {
        result.newsworthiness = 0.5;
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRateLimited = lastError.message.includes('rate_limit') ||
        lastError.message.includes('429') ||
        lastError.message.includes('overloaded');
      const isServerError = lastError.message.includes('500') ||
        lastError.message.includes('503') ||
        lastError.message.includes('529');

      if ((isRateLimited || isServerError) && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[clusterer] Retry ${attempt + 1}/${MAX_RETRIES} for "${article.title.slice(0, 40)}..." after ${delay}ms`);
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  console.error(`[clusterer] Failed to extract keywords for: ${article.title}`, lastError);
  return null;
}

/**
 * Generate a fingerprint from sorted keywords
 */
function generateFingerprint(keywords: string[]): string {
  return keywords
    .map(k => k.toLowerCase().trim())
    .sort()
    .join('|');
}

/**
 * Check if two fingerprints are similar enough to cluster
 * Uses Jaccard similarity (keyword overlap ratio)
 */
function fingerprintSimilarity(a: string, b: string): number {
  const setA = new Set(a.split('|'));
  const setB = new Set(b.split('|'));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Cluster articles by topic similarity
 */
export async function clusterArticles(
  articles: ScrapedArticle[]
): Promise<{
  clusters: ArticleCluster[];
  skipped: ScrapedArticle[];
}> {
  const client = new Anthropic();
  const clusters: ArticleCluster[] = [];
  const skipped: ScrapedArticle[] = [];

  // Extract keywords for each article
  const articlesWithKeywords: Array<{
    article: ScrapedArticle;
    keywords: string[];
    fingerprint: string;
    topic: string;
    relevance: number;
    newsworthiness: number;
  }> = [];

  for (const article of articles) {
    const result = await extractTopicKeywords(client, article);

    // Brief delay between API calls to respect rate limits
    await sleep(INTER_CALL_DELAY_MS);

    if (!result) {
      skipped.push(article);
      continue;
    }

    // Skip articles with low Da Lat relevance
    if (result.dalat_relevance < 0.3) {
      console.log(`[clusterer] Skipping low-relevance article: ${article.title}`);
      skipped.push(article);
      continue;
    }

    articlesWithKeywords.push({
      article,
      keywords: result.keywords,
      fingerprint: generateFingerprint(result.keywords),
      topic: result.topic,
      relevance: result.dalat_relevance,
      newsworthiness: result.newsworthiness,
    });
  }

  // Group by fingerprint similarity
  const assigned = new Set<number>();

  for (let i = 0; i < articlesWithKeywords.length; i++) {
    if (assigned.has(i)) continue;

    const current = articlesWithKeywords[i];
    const clusterArticles = [current.article];
    const allKeywords = new Set(current.keywords);
    assigned.add(i);

    // Find similar articles
    for (let j = i + 1; j < articlesWithKeywords.length; j++) {
      if (assigned.has(j)) continue;

      const candidate = articlesWithKeywords[j];
      const similarity = fingerprintSimilarity(current.fingerprint, candidate.fingerprint);

      if (similarity >= 0.4) {
        clusterArticles.push(candidate.article);
        candidate.keywords.forEach(k => allKeywords.add(k));
        assigned.add(j);
      }
    }

    clusters.push({
      clusterId: `cluster-${Date.now()}-${i}`,
      topicFingerprint: generateFingerprint([...allKeywords]),
      keywords: [...allKeywords],
      articles: clusterArticles,
    });
  }

  console.log(`[clusterer] Created ${clusters.length} clusters from ${articles.length} articles (${skipped.length} skipped)`);
  return { clusters, skipped };
}
