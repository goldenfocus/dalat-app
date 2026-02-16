/**
 * Thanh Niên news scraper
 * Discovery: https://thanhnien.vn/da-lat.html (Đà Lạt tag)
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

const source = getSourceOrThrow('thanhnien');

async function discoverArticles(): Promise<string[]> {
  const html = await fetchWithDelay(source.discoveryUrl, source.requestDelay);
  if (!html) return [];

  const links: string[] = [];
  const pattern = /href="(https:\/\/thanhnien\.vn\/[^"]*-\d+\.htm[l]?)"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const url = match[1];
    if (!url.includes('/tag/') && !url.includes('/da-lat.html') && !links.includes(url)) {
      links.push(url);
    }
  }

  // Also try relative URLs
  const relPattern = /href="(\/[^"]*-\d+\.htm[l]?)"/gi;
  while ((match = relPattern.exec(html)) !== null) {
    const path = match[1];
    const url = source.baseUrl + path;
    // Skip tag/category pages, same filters as absolute URLs
    if (!path.includes('/tag/') && !path.endsWith('/da-lat.html') && !links.includes(url)) {
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

  const content = extractContent(html, ['detail__content', 'detail-content', 'article-content']);
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

export async function scrapeThanhNien(): Promise<ScrapedArticle[]> {
  try {
    console.log(`[thanhnien] Starting scrape from ${source.discoveryUrl}`);

    const articleUrls = await discoverArticles();
    console.log(`[thanhnien] Found ${articleUrls.length} article URLs`);

    const articles: ScrapedArticle[] = [];
    for (const url of articleUrls) {
      try {
        const article = await fetchArticle(url);
        if (article) {
          articles.push(article);
          console.log(`[thanhnien] Scraped: ${article.title.slice(0, 60)}...`);
        }
      } catch (error) {
        console.error(`[thanhnien] Error scraping ${url}:`, error);
      }
    }

    console.log(`[thanhnien] Completed: ${articles.length} articles`);
    return articles;
  } catch (error) {
    console.error(`[thanhnien] Fatal error during scrape:`, error);
    return [];
  }
}
