/**
 * Công An (congan.com.vn) news scraper
 * Discovery: https://congan.com.vn/tag/Đà+Lạt.html (URL-encoded)
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

const source = getSourceOrThrow('congan');

async function discoverArticles(): Promise<string[]> {
  const html = await fetchWithDelay(source.discoveryUrl, source.requestDelay);
  if (!html) return [];

  const links: string[] = [];
  const pattern = /href="((?:https:\/\/congan\.com\.vn)?\/[^"]*\.html)"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    let url = match[1];
    if (url.startsWith('/')) url = source.baseUrl + url;
    // Skip tag pages
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

  const content = extractContent(html, ['detail-content', 'content-detail', 'article-body']);
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

export async function scrapeCongan(): Promise<ScrapedArticle[]> {
  try {
    console.log(`[congan] Starting scrape from ${source.discoveryUrl}`);

    const articleUrls = await discoverArticles();
    console.log(`[congan] Found ${articleUrls.length} article URLs`);

    const articles: ScrapedArticle[] = [];
    for (const url of articleUrls) {
      try {
        const article = await fetchArticle(url);
        if (article) {
          articles.push(article);
          console.log(`[congan] Scraped: ${article.title.slice(0, 60)}...`);
        }
      } catch (error) {
        console.error(`[congan] Error scraping ${url}:`, error);
      }
    }

    console.log(`[congan] Completed: ${articles.length} articles`);
    return articles;
  } catch (error) {
    console.error(`[congan] Fatal error during scrape:`, error);
    return [];
  }
}
