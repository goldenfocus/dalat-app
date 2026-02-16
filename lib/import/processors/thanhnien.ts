import { fetchPage, stripHtml, type NewsArticle } from './news-base';
import { isAllowedByRobots } from '../robots-txt';

const THANHNIEN_BASE = 'https://thanhnien.vn';
const DALAT_KEYWORDS = ['đà lạt', 'dalat', 'lâm đồng', 'lam dong', 'da lat'];

/**
 * Thanh Nien (thanhnien.vn) scraper
 *
 * Scrapes Lam Dong section from Thanh Nien — a major Vietnamese newspaper.
 * Filters for Dalat-related content.
 */
export async function scrapeThanhNien(maxArticles = 15): Promise<NewsArticle[]> {
  const allowed = await isAllowedByRobots(THANHNIEN_BASE);
  if (!allowed) return [];

  const articles: NewsArticle[] = [];

  const listingUrl = `${THANHNIEN_BASE}/lam-dong.html`;
  const html = await fetchPage(listingUrl);
  if (!html) return [];

  // Extract article links
  const linkPattern = /<a[^>]+href="(\/[^"]+\.html)"[^>]*>/g;
  const titlePattern = /title="([^"]+)"/;
  const seen = new Set<string>();
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    if (articles.length >= maxArticles) break;

    const tag = match[0];
    const fullUrl = match[1].startsWith('http') ? match[1] : `${THANHNIEN_BASE}${match[1]}`;

    if (seen.has(fullUrl)) continue;
    seen.add(fullUrl);

    if (fullUrl.includes('/video/') || fullUrl.includes('/infographics/')) continue;

    const titleMatch = tag.match(titlePattern);
    const rawTitle = titleMatch ? titleMatch[1] : '';

    const titleLower = rawTitle.toLowerCase();
    const isDalatRelated = DALAT_KEYWORDS.some((kw) => titleLower.includes(kw));
    if (!isDalatRelated && rawTitle) continue;

    const articleHtml = await fetchPage(fullUrl);
    if (!articleHtml) continue;

    const article = parseThanhNienArticle(articleHtml, fullUrl, rawTitle);
    if (article) {
      articles.push(article);
    }
  }

  return articles;
}

function parseThanhNienArticle(
  html: string,
  url: string,
  fallbackTitle: string
): NewsArticle | null {
  const titleMatch =
    html.match(/<h1[^>]*class="[^"]*detail-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = titleMatch ? stripHtml(titleMatch[1]).trim() : fallbackTitle;

  if (!title) return null;

  const dateMatch =
    html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/) ||
    html.match(/<time[^>]+datetime="([^"]+)"/);
  const publishDate = dateMatch ? dateMatch[1] : undefined;

  const contentMatch =
    html.match(/<div[^>]*class="[^"]*detail__content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div/) ||
    html.match(/<div[^>]*class="[^"]*detail-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div/) ||
    html.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/);
  const content = contentMatch ? stripHtml(contentMatch[1]).trim() : '';

  if (!content || content.length < 100) return null;

  const images: string[] = [];
  const imgPattern = /<img[^>]+src="(https:\/\/[^"]+\.(jpg|jpeg|png|webp))"[^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgPattern.exec(html)) !== null) {
    if (images.length < 5) images.push(imgMatch[1]);
  }

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
    sourcePlatform: 'thanhnien' as const,
  };
}
