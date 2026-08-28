/**
 * VnExpress news scraper
 * Discovery: https://vnexpress.net/tag/da-lat-1 (Đà Lạt tag)
 */

import type { ScrapedArticle } from '../types';
import { getSourceOrThrow } from '../sources';
import {
  fetchWithDelay,
  isDalatRelated,
  scrapeKnownArticle,
} from '../base-scraper';

const source = getSourceOrThrow('vnexpress');
const sourceOrigin = new URL(source.baseUrl).origin;

async function discoverArticles(): Promise<string[]> {
  const html = await fetchWithDelay(source.discoveryUrl, source.requestDelay, sourceOrigin);
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
  const article = await scrapeKnownArticle(source.id, url);
  return article && isDalatRelated(article.title, article.content) ? article : null;
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
