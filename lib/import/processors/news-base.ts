/**
 * Shared base utilities for news scraping.
 * All news scrapers follow the same pattern: fetch HTML, parse with
 * source-specific selectors, normalize to NewsArticle, insert to content_sources.
 */

export interface NewsArticle {
  url: string;
  title: string;
  content: string;
  publishDate: string | null;
  images: string[];
  author: string | null;
  sourcePlatform: string;
}

export interface SelectorConfig {
  titleSelector: RegExp;
  contentSelector: RegExp;
  dateSelector: RegExp;
  imageSelector: RegExp;
  authorSelector?: RegExp;
}

// Rate limiting: track last request time per domain
const lastRequestTime: Record<string, number> = {};
const MIN_DELAY_MS = 1000; // 1 req/sec per domain

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function rateLimitedDelay(url: string): Promise<void> {
  const domain = getDomain(url);
  const now = Date.now();
  const lastTime = lastRequestTime[domain] || 0;
  const elapsed = now - lastTime;

  if (elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }

  lastRequestTime[domain] = Date.now();
}

/**
 * Fetches a URL with polite headers and rate limiting.
 */
export async function fetchPage(url: string): Promise<string | null> {
  await rateLimitedDelay(url);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'vi,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Strips HTML tags and decodes entities.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts article data from HTML using configurable selectors.
 */
export function parseArticle(
  html: string,
  url: string,
  config: SelectorConfig,
  sourcePlatform: string
): NewsArticle | null {
  const titleMatch = html.match(config.titleSelector);
  const title = titleMatch ? stripHtml(titleMatch[1].trim()) : '';

  if (!title) return null;

  const contentMatch = html.match(config.contentSelector);
  const content = contentMatch ? stripHtml(contentMatch[1]) : '';

  const dateMatch = html.match(config.dateSelector);
  const publishDate = dateMatch ? dateMatch[1].trim() : null;

  const images: string[] = [];
  let imgMatch;
  const imgRegex = config.imageSelector;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    if (imgMatch[1]) images.push(imgMatch[1]);
    if (images.length >= 5) break;
  }

  const authorMatch = config.authorSelector ? html.match(config.authorSelector) : null;
  const author = authorMatch ? stripHtml(authorMatch[1].trim()) : null;

  return {
    url,
    title,
    content: content.slice(0, 10000), // Cap at 10k chars
    publishDate,
    images,
    author,
    sourcePlatform,
  };
}

/**
 * Parses an RSS feed and returns entry URLs + titles.
 */
export function parseRssFeed(xml: string): Array<{ url: string; title: string; pubDate: string | null }> {
  const entries: Array<{ url: string; title: string; pubDate: string | null }> = [];

  // Match <item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const linkMatch = itemXml.match(/<link>([^<]+)<\/link>/);
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const dateMatch = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/);

    if (linkMatch?.[1]) {
      entries.push({
        url: linkMatch[1].trim(),
        title: titleMatch ? stripHtml(titleMatch[1].trim()) : '',
        pubDate: dateMatch?.[1]?.trim() || null,
      });
    }
  }

  return entries;
}
