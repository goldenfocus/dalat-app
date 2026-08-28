/**
 * Tuổi Trẻ news scraper
 * Discovery: https://tuoitre.vn/da-lat.html (Đà Lạt tag page)
 */

import type { ScrapedArticle } from '../types';
import { getSourceOrThrow } from '../sources';
import {
  fetchWithDelay,
  isDalatRelated,
  scrapeKnownArticle,
} from '../base-scraper';

const source = getSourceOrThrow('tuoitre');
const sourceOrigin = new URL(source.baseUrl).origin;

/**
 * Extract article URLs from the Tuổi Trẻ Đà Lạt tag page
 */
async function discoverArticles(): Promise<string[]> {
  const html = await fetchWithDelay(source.discoveryUrl, source.requestDelay, sourceOrigin);
  if (!html) return [];

  const links: string[] = [];
  // Match article links - tuoitre uses .htm suffix and numeric article IDs
  const pattern = /href="(\/[^"]*-\d+\.htm[l]?)"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const path = match[1];
    const url = source.baseUrl + path;
    // Skip category, tag, and listing pages
    if (!path.includes('/tag/') && path !== '/da-lat.html' && !links.includes(url)) {
      links.push(url);
    }
  }

  return links.slice(0, source.maxArticles);
}

/**
 * Fetch and parse a single Tuổi Trẻ article
 */
async function fetchArticle(url: string): Promise<ScrapedArticle | null> {
  const article = await scrapeKnownArticle(source.id, url);
  return article && isDalatRelated(article.title, article.content) ? article : null;
}

/**
 * Scrape Tuổi Trẻ for Đà Lạt articles
 */
export async function scrapeTuoiTre(): Promise<ScrapedArticle[]> {
  try {
    console.log(`[tuoitre] Starting scrape from ${source.discoveryUrl}`);

    const articleUrls = await discoverArticles();
    console.log(`[tuoitre] Found ${articleUrls.length} article URLs`);

    const articles: ScrapedArticle[] = [];
    for (const url of articleUrls) {
      try {
        const article = await fetchArticle(url);
        if (article) {
          articles.push(article);
          console.log(`[tuoitre] Scraped: ${article.title.slice(0, 60)}...`);
        }
      } catch (error) {
        console.error(`[tuoitre] Error scraping ${url}:`, error);
      }
    }

    console.log(`[tuoitre] Completed: ${articles.length} articles`);
    return articles;
  } catch (error) {
    console.error(`[tuoitre] Fatal error during scrape:`, error);
    return [];
  }
}
