/**
 * Google News RSS scraper for Dalat-related articles.
 * Uses the Google News RSS feed with a query for "Đà Lạt".
 */

import { fetchPage, parseRssFeed, stripHtml, type NewsArticle } from './news-base';
import { isAllowedByRobots } from '../robots-txt';

// Google News RSS for "Đà Lạt" keyword
const GOOGLE_NEWS_RSS = 'https://news.google.com/rss/search?q=%C4%90%C3%A0+L%E1%BA%A1t&hl=vi&gl=VN&ceid=VN:vi';

/**
 * Scrapes Google News RSS for Dalat-related articles.
 * Returns metadata from RSS entries — full article fetching is delegated
 * to source-specific scrapers or done generically.
 */
export async function scrapeGoogleNews(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  const rssXml = await fetchPage(GOOGLE_NEWS_RSS);
  if (!rssXml) return articles;

  const entries = parseRssFeed(rssXml);

  // Google News entries have redirect URLs — follow them
  for (const entry of entries.slice(0, 15)) {
    // Google News entries include the source in the title like "Article Title - Source Name"
    const titleParts = entry.title.split(' - ');
    const sourceName = titleParts.length > 1 ? titleParts.pop()?.trim() : null;
    const title = titleParts.join(' - ').trim();

    if (!title) continue;

    // Try to follow the Google News redirect to get the real URL
    let realUrl = entry.url;
    try {
      const res = await fetch(entry.url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (res.url && res.url !== entry.url) {
        realUrl = res.url;
      }
    } catch {
      // Keep Google News URL as fallback
    }

    // Check robots.txt for the actual source
    if (!(await isAllowedByRobots(realUrl))) continue;

    articles.push({
      url: realUrl,
      title,
      content: '', // Content will be fetched by News Harvester if needed
      publishDate: entry.pubDate,
      images: [],
      author: sourceName || null,
      sourcePlatform: 'google_news',
    });
  }

  return articles;
}
