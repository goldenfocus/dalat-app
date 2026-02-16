import { fetchPage, stripHtml, type NewsArticle } from './news-base';
import { isAllowedByRobots } from '../robots-txt';

const TUOITRE_BASE = 'https://tuoitre.vn';
const DALAT_KEYWORDS = ['đà lạt', 'dalat', 'lâm đồng', 'lam dong', 'da lat'];

/**
 * Tuoi Tre (tuoitre.vn) scraper
 *
 * Scrapes Lam Dong tagged articles from Tuoi Tre — one of Vietnam's
 * top newspapers. Uses their Lam Dong section listing page.
 */
export async function scrapeTuoiTre(maxArticles = 15): Promise<NewsArticle[]> {
  const allowed = await isAllowedByRobots(TUOITRE_BASE);
  if (!allowed) return [];

  const articles: NewsArticle[] = [];

  // Tuoi Tre Lam Dong section
  const listingUrl = `${TUOITRE_BASE}/lam-dong.htm`;
  const html = await fetchPage(listingUrl);
  if (!html) return [];

  // Extract article links from listing page
  const linkPattern = /<a[^>]+href="(\/[^"]+\.htm)"[^>]*>/g;
  const titlePattern = /title="([^"]+)"/;
  const seen = new Set<string>();
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    if (articles.length >= maxArticles) break;

    const tag = match[0];
    const fullUrl = match[1].startsWith('http') ? match[1] : `${TUOITRE_BASE}${match[1]}`;

    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    // Skip non-article paths
    if (fullUrl.includes('/video/') || fullUrl.includes('/photo/') || !fullUrl.includes('.htm')) {
      continue;
    }

    const titleMatch = tag.match(titlePattern);
    const rawTitle = titleMatch ? titleMatch[1] : '';

    // Filter for Dalat-related content
    const titleLower = rawTitle.toLowerCase();
    const isDalatRelated = DALAT_KEYWORDS.some((kw) => titleLower.includes(kw));
    if (!isDalatRelated && rawTitle) continue;

    // Fetch individual article
    const articleHtml = await fetchPage(fullUrl);
    if (!articleHtml) continue;

    const article = parseTuoiTreArticle(articleHtml, fullUrl, rawTitle);
    if (article) {
      articles.push(article);
    }
  }

  return articles;
}

function parseTuoiTreArticle(
  html: string,
  url: string,
  fallbackTitle: string
): NewsArticle | null {
  // Title
  const titleMatch = html.match(/<h1[^>]*class="[^"]*article-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
  const title = titleMatch ? stripHtml(titleMatch[1]).trim() : fallbackTitle;

  if (!title) return null;

  // Date
  const dateMatch =
    html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/) ||
    html.match(/<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)</);
  const publishDate = dateMatch ? dateMatch[1] : undefined;

  // Content
  const contentMatch =
    html.match(/<div[^>]*class="[^"]*detail-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div/) ||
    html.match(/<div[^>]*class="[^"]*content-detail[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div/) ||
    html.match(/<div[^>]*id="main-detail-body"[^>]*>([\s\S]*?)<\/div>/);
  const content = contentMatch ? stripHtml(contentMatch[1]).trim() : '';

  if (!content || content.length < 100) return null;

  // Images
  const images: string[] = [];
  const imgPattern = /<img[^>]+src="(https:\/\/[^"]+\.(jpg|jpeg|png|webp))"[^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgPattern.exec(html)) !== null) {
    if (images.length < 5) images.push(imgMatch[1]);
  }

  // Author
  const authorMatch =
    html.match(/<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)/) ||
    html.match(/<div[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)/);
  const author = authorMatch ? stripHtml(authorMatch[1]).trim() : undefined;

  return {
    url,
    title,
    content,
    publishDate: publishDate ?? null,
    images,
    author: author ?? null,
    sourcePlatform: 'tuoitre' as const,
  };
}
