/**
 * VnExpress news scraper
 * Discovery: https://vnexpress.net/tag/da-lat-1 (Đà Lạt tag)
 */

import type { ScrapedArticle } from '../types';
import { getSourceOrThrow } from '../sources';
import {
  fetchWithDelay,
  extractTitle,
  extractContent,
  extractImages,
  extractPublishedDate,
  isDalatRelated,
} from '../base-scraper';

const source = getSourceOrThrow('vnexpress');

async function discoverArticles(): Promise<string[]> {
  const html = await fetchWithDelay(source.discoveryUrl, source.requestDelay);
  if (!html) return [];

  const links: string[] = [];
  // VnExpress uses clean URLs with .html suffix
  const pattern = /href="(https:\/\/vnexpress\.net\/[^"]*-\d+\.html)"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const url = match[1];
    // Skip category/tag pages
    if (!url.includes('/tag/') && !links.includes(url)) {
      links.push(url);
    }
  }

  return links.slice(0, source.maxArticles);
}

async function fetchArticle(url: string): Promise<ScrapedArticle | null> {
  const html = await fetchWithDelay(url, source.requestDelay);
  if (!html) return null;

  const title = extractTitle(html);
  if (!title) return null;

  const content = extractContent(html, ['fck_detail', 'detail-content']);
  if (!content || content.length < 50) return null;

  if (!isDalatRelated(title, content)) return null;

  return {
    sourceId: source.id,
    sourceUrl: url,
    sourceName: source.name,
    title,
    content,
    imageUrls: extractImages(html),
    publishedAt: extractPublishedDate(html),
  };
}

export async function scrapeVnExpress(): Promise<ScrapedArticle[]> {
  try {
    console.log(`[vnexpress] Starting scrape from ${source.discoveryUrl}`);

    const articleUrls = await discoverArticles();
    console.log(`[vnexpress] Found ${articleUrls.length} article URLs`);

    const articles: ScrapedArticle[] = [];
    for (const url of articleUrls) {
      try {
        const article = await fetchArticle(url);
        if (article) {
          articles.push(article);
          console.log(`[vnexpress] Scraped: ${article.title.slice(0, 60)}...`);
        }
      } catch (error) {
        console.error(`[vnexpress] Error scraping ${url}:`, error);
      }
    }

    console.log(`[vnexpress] Completed: ${articles.length} articles`);
    return articles;
  } catch (error) {
    console.error(`[vnexpress] Fatal error during scrape:`, error);
    return [];
  }
}
