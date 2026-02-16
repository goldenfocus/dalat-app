/**
 * Tuổi Trẻ news scraper
 * Discovery: https://tuoitre.vn/da-lat.html (Đà Lạt tag page)
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

const source = getSourceOrThrow('tuoitre');

/**
 * Extract article URLs from the Tuổi Trẻ Đà Lạt tag page
 */
async function discoverArticles(): Promise<string[]> {
  const html = await fetchWithDelay(source.discoveryUrl, source.requestDelay);
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
  const html = await fetchWithDelay(url, source.requestDelay);
  if (!html) return null;

  const title = extractTitle(html);
  if (!title) return null;

  // Extract content from detail-content div
  const content = extractContent(html, ['detail-content', 'detail__content', 'fck_detail']);
  if (!content || content.length < 50) return null;

  // Verify Dalat relevance
  if (!isDalatRelated(title, content)) return null;

  const images = extractImages(html);
  const publishedAt = extractPublishedDate(html);

  return {
    sourceId: source.id,
    sourceUrl: url,
    sourceName: source.name,
    title,
    content,
    imageUrls: images,
    publishedAt,
  };
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
