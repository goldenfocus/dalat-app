/**
 * Base scraper for Vietnamese news sites
 * Provides shared functionality: rate limiting, HTML stripping, dedup
 */

import { getSourceByArticleUrl, getSourceById } from './sources';
import type { NewsProcessResult, ScrapedArticle } from './types';

const USER_AGENT = 'Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)';

/** Default timeout for fetch requests (15 seconds) */
const FETCH_TIMEOUT_MS = 15_000;

export interface FetchedHtml {
  html: string;
  finalUrl: string;
}

/**
 * Rate-limited fetch with proper headers, timeout, and final-URL retention.
 */
async function fetchWithDelayResult(
  url: string,
  delay: number = 500,
  allowedOrigin?: string
): Promise<FetchedHtml | null> {
  await new Promise(resolve => setTimeout(resolve, delay));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = url;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
      const response = await fetch(currentUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi,en;q=0.5',
        },
        redirect: allowedOrigin ? 'manual' : 'follow',
        signal: controller.signal,
      });

      if (allowedOrigin && response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirectCount === 3) {
          console.warn(`[news-scraper] Refused unresolved redirect for ${currentUrl}`);
          return null;
        }
        const redirectUrl = new URL(location, currentUrl);
        if (
          redirectUrl.origin !== allowedOrigin
          || redirectUrl.username !== ''
          || redirectUrl.password !== ''
        ) {
          console.warn(`[news-scraper] Refused cross-origin redirect from ${currentUrl}`);
          return null;
        }
        currentUrl = redirectUrl.toString();
        continue;
      }

      if (!response.ok) {
        console.log(`[news-scraper] ${currentUrl} returned ${response.status}`);
        return null;
      }

      return {
        html: await response.text(),
        finalUrl: response.url || currentUrl,
      };
    }

    return null;
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

/** HTML-only compatibility wrapper used by discovery pages. */
export async function fetchWithDelay(
  url: string,
  delay: number = 500,
  allowedOrigin?: string
): Promise<string | null> {
  const result = await fetchWithDelayResult(url, delay, allowedOrigin);
  return result?.html ?? null;
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
export function extractImages(html: string, _contentSelector?: string): string[] {
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
export function normalizePublishedDate(value: string): string | null {
  const cleaned = stripHtml(value).trim();
  if (!cleaned) return null;

  // Vietnamese publisher headers commonly use DD/MM/YYYY HH:MM. Da Lat has
  // no daylight-saving shift, so parse this before Date.parse can reinterpret
  // it as US MM/DD in the server's local timezone.
  const vnDate = cleaned.match(
    /(?:^|\D)(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(?:GMT)?\s*\+?7)?(?:\D|$)/i
  );
  if (vnDate) {
    const [, dayText, monthText, yearText, hourText, minuteText, secondText = '00'] = vnDate;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const daysInMonth = month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;

    if (
      year < 2000 || year > new Date().getUTCFullYear() + 1 ||
      month < 1 || month > 12 || day < 1 || day > daysInMonth ||
      hour < 0 || hour > 23 || minute < 0 || minute > 59 ||
      second < 0 || second > 59
    ) {
      return null;
    }

    const utcMillis = Date.UTC(year, month - 1, day, hour - 7, minute, second);
    return new Date(utcMillis).toISOString();
  }

  // Only hand unambiguous year-first ISO or named-month RFC values to
  // Date.parse. Date-only values are rejected because they invent a time.
  const isYearFirstTimestamp = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/iu.test(cleaned);
  const isNamedMonthTimestamp = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/iu.test(cleaned)
    && /\d{1,2}:\d{2}/u.test(cleaned);
  if (!isYearFirstTimestamp && !isNamedMonthTimestamp) return null;

  const hasExplicitOffset = /(?:Z|[+-]\d{2}:?\d{2}|(?:GMT|UTC)\s*[+-]?\d{0,2})\s*$/iu.test(cleaned);
  const parseValue = hasExplicitOffset
    ? cleaned
    : isYearFirstTimestamp
      ? `${cleaned.replace(' ', 'T')}+07:00`
      : `${cleaned} GMT+0700`;
  const timestamp = Date.parse(parseValue);
  if (!Number.isFinite(timestamp)) return null;
  const parsed = new Date(timestamp);
  const parsedYear = parsed.getUTCFullYear();
  return parsedYear >= 2000 && parsedYear <= new Date().getUTCFullYear() + 1
    ? parsed.toISOString()
    : null;
}

export function extractPublishedDate(html: string): string | null {
  const candidates = [
    // OpenGraph/article metadata.
    html.match(/<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']article:published_time["']/i)?.[1],
    // Common explicit publication metadata names.
    html.match(/<meta\s+name=["'](?:pubdate|publishdate|date|parsely-pub-date)["']\s+content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta\s+content=["']([^"']+)["']\s+name=["'](?:pubdate|publishdate|date|parsely-pub-date)["']/i)?.[1],
    // JSON-LD is publisher-authored structured data.
    html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i)?.[1],
    // Only a time element explicitly marked as the publication date.
    html.match(/<time\b[^>]*itemprop=["']datePublished["'][^>]*datetime=["']([^"']+)["']/i)?.[1],
    html.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*itemprop=["']datePublished["'][^>]*>/i)?.[1],
    // Publisher header containers, never an arbitrary date in article prose.
    html.match(/<(?:div|span|p)\b[^>]*class=["'][^"']*(?:publish(?:ed)?(?:-|_)?(?:date|time)?|pubdate|detail-time|date-time|article-date|meta-time|time-detail)[^"']*["'][^>]*>([^<]{0,120})<\//i)?.[1],
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizePublishedDate(candidate);
    if (normalized) return normalized;
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
 * Validate a persisted source URL before fetching it again. Exact origin
 * matching is intentionally stricter than a suffix/subdomain check: it blocks
 * lookalike hosts, credentials, protocol downgrades, and alternate ports.
 */
export function isRegisteredSourceArticleUrl(sourceId: string, sourceUrl: string): boolean {
  const source = getSourceById(sourceId);
  return Boolean(source && getSourceByArticleUrl(sourceUrl)?.id === source.id);
}

type KnownArticleHtmlFetcher = (
  url: string,
  delay?: number,
  allowedOrigin?: string
) => Promise<string | FetchedHtml | null>;

function normalizedPath(url: URL): string {
  const path = url.pathname.replace(/\/{2,}/gu, '/').replace(/\/$/u, '');
  return path || '/';
}

function isListingPath(url: URL): boolean {
  const path = normalizedPath(url).toLowerCase();
  return path === '/'
    || /^\/(?:tim-kiem|timkiem|search)(?:[./]|$)/u.test(path)
    || /^\/(?:tag|tags|category|categories|chuyen-muc)(?:[./]|$)/u.test(path)
    || /^\/da-lat\.html?$/u.test(path)
    || /(?:^|[?&])(?:q|query|keyword|keywords|search)=/u.test(url.search.toLowerCase());
}

function extractDeclaredArticleUrls(html: string, baseUrl: string): URL[] {
  const values = [
    html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/iu)?.[1],
    html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/iu)?.[1],
    html.match(/<meta\b[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["'][^>]*>/iu)?.[1],
    html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:url["'][^>]*>/iu)?.[1],
  ];
  return values.flatMap((value) => {
    if (!value) return [];
    try {
      return [new URL(value, baseUrl)];
    } catch {
      return [];
    }
  });
}

/**
 * A stale source may redirect to a publisher home/search page that still has
 * enough text to look like an article. Recovery is allowed only when the final
 * and declared canonical paths preserve the persisted article identity.
 */
export function isSafeKnownArticleResponse(
  sourceId: string,
  sourceUrl: string,
  finalUrl: string,
  html: string
): boolean {
  if (!isRegisteredSourceArticleUrl(sourceId, sourceUrl)) return false;
  try {
    const original = new URL(sourceUrl);
    const final = new URL(finalUrl);
    if (
      getSourceByArticleUrl(final.toString())?.id !== sourceId
      || isListingPath(original)
      || isListingPath(final)
      || normalizedPath(final) !== normalizedPath(original)
    ) {
      return false;
    }

    for (const declared of extractDeclaredArticleUrls(html, final.toString())) {
      if (
        getSourceByArticleUrl(declared.toString())?.id !== sourceId
        || isListingPath(declared)
        || normalizedPath(declared) !== normalizedPath(original)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

const fetchKnownArticleHtml: KnownArticleHtmlFetcher = (
  url,
  delay,
  allowedOrigin
) => fetchWithDelayResult(url, delay, allowedOrigin);

function contentClassNames(selectorList: string): string[] {
  const classNames: string[] = [];
  for (const selector of selectorList.split(',')) {
    for (const match of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
      classNames.push(match[1]);
    }
  }
  return [...new Set(classNames)];
}

/**
 * Re-scrape one already-known source URL without running discovery. The helper
 * refuses any URL outside the registered source origin before making a request,
 * and the default fetcher also refuses cross-origin redirects.
 */
export async function scrapeKnownArticle(
  sourceId: string,
  sourceUrl: string,
  fetchHtml: KnownArticleHtmlFetcher = fetchKnownArticleHtml
): Promise<ScrapedArticle | null> {
  const source = getSourceById(sourceId);
  if (!source || !isRegisteredSourceArticleUrl(sourceId, sourceUrl)) return null;

  const registeredOrigin = new URL(source.baseUrl).origin;
  const fetched = await fetchHtml(sourceUrl, source.requestDelay, registeredOrigin);
  if (!fetched) return null;
  const html = typeof fetched === 'string' ? fetched : fetched.html;
  const finalUrl = typeof fetched === 'string' ? sourceUrl : fetched.finalUrl;
  if (!isSafeKnownArticleResponse(sourceId, sourceUrl, finalUrl, html)) return null;

  const title = extractTitle(html);
  const content = extractContent(html, contentClassNames(source.selectors.content));
  if (!title || !content || content.length < 50) return null;

  return {
    sourceId: source.id,
    sourceUrl,
    sourceName: source.name,
    title,
    content,
    imageUrls: extractImages(html),
    publishedAt: extractPublishedDate(html),
    retrievedAt: new Date().toISOString(),
  };
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
