/**
 * Báo Pháp Luật news scraper
 * Discovery: https://baophapluat.vn/da-lat-tag285.html
 */

import type { ScrapedArticle } from '../types';
import { getSourceOrThrow } from '../sources';
import {
  fetchWithDelay,
  isDalatRelated,
  scrapeKnownArticle,
} from '../base-scraper';

const source = getSourceOrThrow('baophapluat');
const sourceOrigin = new URL(source.baseUrl).origin;

async function discoverArticles(): Promise<string[]> {
  const html = await fetchWithDelay(source.discoveryUrl, source.requestDelay, sourceOrigin);
  if (!html) return [];

  const links: string[] = [];
  const pattern = /href="((?:https:\/\/baophapluat\.vn)?\/[^"]*\.html)"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    let url = match[1];
    if (url.startsWith('/')) url = source.baseUrl + url;
    // Skip tag/category pages
    if (!url.includes('-tag') && !url.includes('chuyenmuc') && !links.includes(url)) {
      links.push(url);
    }
  }

  return links.slice(0, source.maxArticles);
}

async function fetchArticle(url: string): Promise<ScrapedArticle | null> {
  const article = await scrapeKnownArticle(source.id, url);
  return article && isDalatRelated(article.title, article.content) ? article : null;
}

export async function scrapeBaoPhapLuat(): Promise<ScrapedArticle[]> {
  try {
    console.log(`[baophapluat] Starting scrape from ${source.discoveryUrl}`);

    const articleUrls = await discoverArticles();
    console.log(`[baophapluat] Found ${articleUrls.length} article URLs`);

    const articles: ScrapedArticle[] = [];
    for (const url of articleUrls) {
      try {
        const article = await fetchArticle(url);
        if (article) {
          articles.push(article);
          console.log(`[baophapluat] Scraped: ${article.title.slice(0, 60)}...`);
        }
      } catch (error) {
        console.error(`[baophapluat] Error scraping ${url}:`, error);
      }
    }

    console.log(`[baophapluat] Completed: ${articles.length} articles`);
    return articles;
  } catch (error) {
    console.error(`[baophapluat] Fatal error during scrape:`, error);
    return [];
  }
}
