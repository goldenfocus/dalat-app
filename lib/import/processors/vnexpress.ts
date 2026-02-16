/**
 * VnExpress Dalat news scraper.
 * Scrapes the Lam Dong section RSS feed and individual article pages.
 */

import { fetchPage, parseRssFeed, stripHtml, type NewsArticle } from './news-base';
import { isAllowedByRobots } from '../robots-txt';

const RSS_URL = 'https://vnexpress.net/rss/tin-moi-nhat.rss';
const DALAT_KEYWORDS = ['đà lạt', 'da lat', 'dalat', 'lâm đồng', 'lam dong'];

const ARTICLE_SELECTORS = {
  titleSelector: /<h1[^>]*class="title-detail"[^>]*>([\s\S]*?)<\/h1>/i,
  contentSelector: /<article[^>]*class="fck_detail"[^>]*>([\s\S]*?)<\/article>/i,
  dateSelector: /<span[^>]*class="date"[^>]*>([^<]+)<\/span>/i,
  imageSelector: /<img[^>]*data-src="([^"]+)"[^>]*>/gi,
  authorSelector: /<p[^>]*class="author[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
};

/**
 * Scrapes VnExpress for Dalat-related articles.
 * Returns articles from the last 24 hours that mention Dalat.
 */
export async function scrapeVnExpress(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  // Fetch RSS feed
  const rssXml = await fetchPage(RSS_URL);
  if (!rssXml) return articles;

  const entries = parseRssFeed(rssXml);

  // Filter for Dalat-related entries by title
  const dalatEntries = entries.filter((entry) => {
    const titleLower = entry.title.toLowerCase();
    return DALAT_KEYWORDS.some((kw) => titleLower.includes(kw));
  });

  // Fetch individual articles (up to 10)
  for (const entry of dalatEntries.slice(0, 10)) {
    if (!(await isAllowedByRobots(entry.url))) continue;

    const html = await fetchPage(entry.url);
    if (!html) continue;

    const titleMatch = html.match(ARTICLE_SELECTORS.titleSelector);
    const title = titleMatch ? stripHtml(titleMatch[1]) : entry.title;

    const contentMatch = html.match(ARTICLE_SELECTORS.contentSelector);
    const content = contentMatch ? stripHtml(contentMatch[1]) : '';

    if (!content) continue;

    const dateMatch = html.match(ARTICLE_SELECTORS.dateSelector);
    const images: string[] = [];
    let imgMatch;
    const imgRegex = /<img[^>]*(?:data-src|src)="(https:[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>/gi;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      images.push(imgMatch[1]);
      if (images.length >= 5) break;
    }

    const authorMatch = html.match(ARTICLE_SELECTORS.authorSelector);

    articles.push({
      url: entry.url,
      title,
      content: content.slice(0, 10000),
      publishDate: entry.pubDate || dateMatch?.[1]?.trim() || null,
      images,
      author: authorMatch ? stripHtml(authorMatch[1]) : null,
      sourcePlatform: 'vnexpress',
    });
  }

  return articles;
}
