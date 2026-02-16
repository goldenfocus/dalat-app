/**
 * Base scraper for Vietnamese news sites
 * Provides shared functionality: rate limiting, HTML stripping, dedup
 */

import type { NewsProcessResult } from './types';

const USER_AGENT = 'Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)';

/** Default timeout for fetch requests (15 seconds) */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Rate-limited fetch with proper headers and timeout
 */
export async function fetchWithDelay(
  url: string,
  delay: number = 500
): Promise<string | null> {
  await new Promise(resolve => setTimeout(resolve, delay));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi,en;q=0.5',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.log(`[news-scraper] ${url} returned ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[news-scraper] Timeout fetching ${url} (${FETCH_TIMEOUT_MS}ms)`);
    } else {
      console.error(`[news-scraper] Failed to fetch ${url}:`, error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Strip HTML tags and normalize whitespace
 */
export function stripHtml(html: string): string {
  return html
    // Remove script and style elements
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract text using a regex pattern from HTML
 */
export function extractByPattern(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match ? stripHtml(match[1] || match[0]) : null;
}

/**
 * Extract og:image or first image from HTML
 */
export function extractOgImage(html: string): string | null {
  // Try og:image first
  const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
    || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
  if (ogMatch) return ogMatch[1];
  return null;
}

/**
 * Extract all images from article content HTML
 * Handles both src and data-src/data-original (lazy-loading common on Vietnamese sites)
 */
export function extractImages(html: string, contentSelector?: string): string[] {
  const images: string[] = [];

  // Extract og:image
  const ogImage = extractOgImage(html);
  if (ogImage) images.push(ogImage);

  // Extract images from content - check src, data-src, and data-original attributes
  const imgRegex = /<img[^>]+(?:src|data-src|data-original)="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    // Filter out tracking pixels, icons, tiny images, and data URIs
    if (src && !src.startsWith('data:')
        && !src.includes('pixel') && !src.includes('icon') && !src.includes('logo')
        && !src.includes('avatar') && !src.includes('1x1') && !src.endsWith('.gif')) {
      images.push(src);
    }
  }

  // Deduplicate
  return [...new Set(images)];
}

/**
 * Extract published date from HTML meta tags or content
 */
export function extractPublishedDate(html: string): string | null {
  // Try meta tags first
  const metaMatch = html.match(
    /<meta\s+property="article:published_time"\s+content="([^"]+)"/i
  ) || html.match(
    /<meta\s+content="([^"]+)"\s+property="article:published_time"/i
  );
  if (metaMatch) return metaMatch[1];

  // Try Vietnamese date format: DD/MM/YYYY HH:MM
  const vnDateMatch = html.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-,]?\s*(\d{1,2}:\d{2})?/);
  if (vnDateMatch) {
    const [, day, month, year, time] = vnDateMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}${time ? `T${time}:00` : 'T00:00:00'}+07:00`;
  }

  return null;
}

/**
 * Extract article links from a discovery/listing page
 */
export function extractArticleLinks(
  html: string,
  baseUrl: string,
  linkPattern?: RegExp
): string[] {
  const links: string[] = [];
  // Match href attributes in anchor tags
  const pattern = linkPattern || /href="([^"]*\.html[^"]*)"/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    let url = match[1];
    // Make absolute
    if (url.startsWith('/')) {
      url = baseUrl + url;
    } else if (!url.startsWith('http')) {
      url = baseUrl + '/' + url;
    }
    // Filter out non-article links
    if (url.includes(baseUrl) && !url.includes('#') && !url.includes('javascript:')) {
      links.push(url);
    }
  }
  return [...new Set(links)];
}

/**
 * Extract title from article HTML
 */
export function extractTitle(html: string): string | null {
  // Try h1 first
  const h1Match = html.match(/<h1[^>]*class="[^"]*(?:title|headline)[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return stripHtml(h1Match[1]);

  // Try any h1
  const anyH1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (anyH1) return stripHtml(anyH1[1]);

  // Try og:title
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
    || html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i);
  if (ogTitle) return stripHtml(ogTitle[1]);

  // Try page title
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) return stripHtml(titleTag[1]);

  return null;
}

/**
 * Extract the inner HTML of the first element matching a class name,
 * handling nested tags of the same type via bracket counting.
 */
function extractElementByClass(html: string, className: string): string | null {
  // Find the opening tag with the given class
  const openPattern = new RegExp(
    `<(div|article|section)[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`,
    'i'
  );
  const openMatch = openPattern.exec(html);
  if (!openMatch) return null;

  const tagName = openMatch[1].toLowerCase();
  const startIdx = openMatch.index + openMatch[0].length;

  // Count nested open/close tags of the same type to find the matching close
  let depth = 1;
  const openTag = new RegExp(`<${tagName}[\\s>]`, 'gi');
  const closeTag = new RegExp(`</${tagName}>`, 'gi');

  // Collect all open and close tag positions after startIdx
  const tags: Array<{ pos: number; isOpen: boolean }> = [];

  openTag.lastIndex = startIdx;
  let m;
  while ((m = openTag.exec(html)) !== null) {
    tags.push({ pos: m.index, isOpen: true });
  }
  closeTag.lastIndex = startIdx;
  while ((m = closeTag.exec(html)) !== null) {
    tags.push({ pos: m.index, isOpen: false });
  }

  // Sort by position
  tags.sort((a, b) => a.pos - b.pos);

  for (const tag of tags) {
    if (tag.isOpen) {
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(startIdx, tag.pos);
      }
    }
  }

  // If we never balanced, return everything from start to end (best effort)
  return null;
}

/**
 * Extract main content from article HTML.
 * Accepts class names (without dots) to search for content containers.
 */
export function extractContent(html: string, selectors: string[]): string {
  for (const selector of selectors) {
    // Strip leading dot if provided (e.g. '.fck_detail' -> 'fck_detail')
    const className = selector.startsWith('.') ? selector.slice(1) : selector;
    const inner = extractElementByClass(html, className);
    if (inner) {
      const content = stripHtml(inner);
      if (content.length > 100) return content;
    }
  }

  // Fallback: extract from og:description
  const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
    || html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i);
  if (ogDesc) return stripHtml(ogDesc[1]);

  return '';
}

/**
 * Check if an article is about Da Lat (for sites that mix regions)
 */
export function isDalatRelated(title: string, content: string): boolean {
  const text = `${title} ${content}`.toLowerCase();
  const keywords = [
    'đà lạt', 'da lat', 'dalat', 'lâm đồng', 'lam dong',
    'đà-lạt', 'tp đà lạt', 'tp. đà lạt',
    'thành phố đà lạt', 'hồ xuân hương', 'langbiang', 'lang biang',
    'bảo lộc', 'đức trọng', 'lạc dương', 'đơn dương',
  ];
  return keywords.some(k => text.includes(k));
}

/**
 * Create empty process result
 */
export function createEmptyNewsResult(): NewsProcessResult {
  return {
    scraped: 0,
    newArticles: 0,
    duplicatesSkipped: 0,
    errors: 0,
    errorMessages: [],
  };
}
