/**
 * Lam Dong Province government portal scraper.
 * Extends the existing dalat-gov.ts pattern for the provincial government site.
 */

import { fetchPage, stripHtml, type NewsArticle } from './news-base';
import { isAllowedByRobots } from '../robots-txt';

const BASE_URL = 'https://www.lamdong.gov.vn';
const NEWS_LISTING_URL = `${BASE_URL}/tin-tuc`;
const DALAT_KEYWORDS = ['đà lạt', 'da lat', 'dalat', 'thành phố đà lạt', 'tp đà lạt'];

/**
 * Scrapes the Lam Dong Province government portal for news articles.
 * Government content is public domain in Vietnam.
 */
export async function scrapeLamdongGov(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  if (!(await isAllowedByRobots(NEWS_LISTING_URL))) return articles;

  // Fetch news listing page
  const listingHtml = await fetchPage(NEWS_LISTING_URL);
  if (!listingHtml) return articles;

  // Extract article links from listing
  const linkRegex = /<a[^>]*href="(\/[^"]*tin-tuc[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const links: Array<{ url: string; title: string }> = [];
  let match;

  while ((match = linkRegex.exec(listingHtml)) !== null) {
    const href = match[1];
    const title = stripHtml(match[2]);

    if (title && href && !links.some((l) => l.url === href)) {
      links.push({
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        title,
      });
    }
  }

  // Filter for Dalat-related articles
  const dalatLinks = links.filter((link) => {
    const titleLower = link.title.toLowerCase();
    return DALAT_KEYWORDS.some((kw) => titleLower.includes(kw));
  });

  // Fetch individual articles (up to 10)
  for (const link of dalatLinks.slice(0, 10)) {
    if (!(await isAllowedByRobots(link.url))) continue;

    const html = await fetchPage(link.url);
    if (!html) continue;

    // Generic gov article parsing
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : link.title;

    // Look for content in common gov site patterns
    const contentMatch =
      html.match(/<div[^>]*class="[^"]*detail-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class="[^"]*content-detail[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const content = contentMatch ? stripHtml(contentMatch[1]) : '';
    if (!content || content.length < 100) continue;

    const dateMatch = html.match(/<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/i) ||
      html.match(/<time[^>]*datetime="([^"]+)"/i);

    const images: string[] = [];
    const imgRegex = /<img[^>]*src="([^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const src = imgMatch[1].startsWith('http') ? imgMatch[1] : `${BASE_URL}${imgMatch[1]}`;
      images.push(src);
      if (images.length >= 5) break;
    }

    articles.push({
      url: link.url,
      title,
      content: content.slice(0, 10000),
      publishDate: dateMatch?.[1]?.trim() || null,
      images,
      author: 'Lam Dong Province',
      sourcePlatform: 'lamdong_gov',
    });
  }

  return articles;
}
