import { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  checkDuplicateByUrl,
  createEmptyResult,
  type ProcessResult,
} from "../utils";
import {
  importExtractedEvents,
  type ExtractedEvent,
} from "../import-events";
import { triggerTranslationServer } from "@/lib/translations";
import { EXTRACTION_MODEL } from "../extraction-model";

const anthropic = new Anthropic();

const BASE_URL = "https://dalat-info.gov.vn";

/**
 * Categories to scrape from dalat-info.gov.vn
 * These contain event announcements mixed with news articles
 */
const CATEGORIES_TO_SCRAPE = [
  "/danh-muc/du-lich", // Tourism
  "/danh-muc/van-hoa", // Culture
];

/**
 * Article scraped from gov.vn
 */
export interface GovArticle {
  url: string;
  title: string;
  publishDate?: string;
  content: string;
  imageUrls: string[];
}

/**
 * Fetch a category page and extract article links
 */
async function fetchCategoryArticles(
  categoryPath: string,
  maxPages: number = 2
): Promise<string[]> {
  const articleUrls: string[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? `${BASE_URL}${categoryPath}` : `${BASE_URL}${categoryPath}?page=${page}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)",
          Accept: "text/html",
        },
      });

      if (!response.ok) {
        console.log(`[dalat-gov] Category page ${url} returned ${response.status}`);
        break;
      }

      const html = await response.text();

      // Extract article URLs from the category page
      // Pattern: full URL to /bai-viet/article-slug (may be absolute or relative)
      const articleMatches = html.matchAll(/href="((?:https:\/\/dalat-info\.gov\.vn)?\/bai-viet\/[^"]+)"/g);
      for (const match of articleMatches) {
        let articleUrl = match[1];
        if (!articleUrl.startsWith("http")) {
          articleUrl = `${BASE_URL}${articleUrl}`;
        }
        if (!articleUrls.includes(articleUrl)) {
          articleUrls.push(articleUrl);
        }
      }

      // Check if there's a next page
      if (!html.includes(`page=${page + 1}`)) {
        break;
      }
    } catch (error) {
      console.error(`[dalat-gov] Error fetching ${url}:`, error);
      break;
    }
  }

  return articleUrls;
}

/**
 * Fetch and parse a single article
 */
export async function fetchArticle(url: string): Promise<GovArticle | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      console.log(`[dalat-gov] Article ${url} returned ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract title - gov.vn uses <h1 data-title-en="...">Title</h1>
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : "";
    // Remove site suffix from title if present
    title = title.replace(/ - Đà Lạt Info.*$/, "").trim();

    // Extract publish date
    const dateMatch = html.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const publishDate = dateMatch ? dateMatch[1] : undefined;

    // Extract main content
    // gov.vn pages have content in <div class="post-content-body">...</div>
    // The content can be large with nested divs, so we extract from the opening tag
    // to the closing section (related-posts or similar)
    let content = "";

    const contentStart = html.indexOf('class="post-content-body"');
    if (contentStart !== -1) {
      // Skip to the actual content (after the opening tag)
      const tagEnd = html.indexOf('>', contentStart);
      const actualStart = tagEnd !== -1 ? tagEnd + 1 : contentStart;

      // Find where the content section ends (usually at related posts or footer)
      const contentEndMarkers = ['class="related-posts"', 'class="post-attachments"', '<!-- footer -->', '</main>'];
      let contentEnd = html.length;
      for (const marker of contentEndMarkers) {
        const idx = html.indexOf(marker, actualStart);
        if (idx !== -1 && idx < contentEnd) {
          contentEnd = idx;
        }
      }
      content = html.slice(actualStart, contentEnd);
    } else {
      // Fallback to article or generic content div
      const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      content = articleMatch ? articleMatch[1] : "";
    }

    // Strip HTML tags but preserve line breaks
    content = content
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]+;/gi, " ") // Other HTML entities
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Extract image URLs
    const imageUrls: string[] = [];
    const imgMatches = html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi);
    for (const match of imgMatches) {
      let imgUrl = match[1];
      if (imgUrl.startsWith("/")) {
        imgUrl = `${BASE_URL}${imgUrl}`;
      }
      if (imgUrl.includes("dalat-info.gov.vn") && !imgUrl.includes("logo") && !imgUrl.includes("icon")) {
        imageUrls.push(imgUrl);
      }
    }

    if (!title || !content || content.length < 100) {
      return null;
    }

    return { url, title, publishDate, content, imageUrls };
  } catch (error) {
    console.error(`[dalat-gov] Error fetching article ${url}:`, error);
    return null;
  }
}

/**
 * Use Claude to extract event information from article content
 */
export async function extractEventsFromArticle(article: GovArticle): Promise<ExtractedEvent[]> {
  try {
    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Analyze this Vietnamese article from dalat-info.gov.vn and extract any EVENT announcements.

Article Title: ${article.title}
Published: ${article.publishDate || "Unknown"}

Content:
${article.content.slice(0, 4000)}

Instructions:
- Only extract ACTUAL EVENTS (festivals, competitions, performances, exhibitions, etc.) with specific dates
- Do NOT extract general news, policies, or reports without event dates
- Convert Vietnamese dates to ISO format (e.g., "ngày 16/2/2026" → "2026-02-16")
- For lunar calendar dates, convert to solar calendar for 2026
- If an event spans multiple days, include both startDate and endDate

Return a JSON array of events. If no events found, return [].
Each event should have:
{
  "title": "Event name in Vietnamese",
  "description": "Brief description (2-3 sentences)",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD" (if multi-day),
  "startTime": "HH:MM" (if mentioned),
  "locationName": "Venue name",
  "address": "Full address if available",
  "organizerName": "Organizing body if mentioned"
}

Output ONLY the JSON array, no other text.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Validate and filter events
    return parsed.filter(
      (e: ExtractedEvent) =>
        e.title &&
        e.startDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.startDate)
    );
  } catch (error) {
    // A malformed model answer means "nothing extractable" — safe to treat as empty.
    if (error instanceof SyntaxError) {
      console.warn(`[dalat-gov] Unparseable extraction output for ${article.url}`);
      return [];
    }
    // API errors (retired model, auth, rate limit) must be LOUD, never "no events".
    // Swallowing these is how the pipeline died silently for 5 months.
    console.error(`[dalat-gov] Extraction API error for ${article.url}:`, error);
    throw error;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Fetch all recent articles from gov.vn categories
 */
export async function fetchGovArticles(): Promise<GovArticle[]> {
  const allArticleUrls: string[] = [];

  for (const category of CATEGORIES_TO_SCRAPE) {
    const urls = await fetchCategoryArticles(category, 2);
    console.log(`[dalat-gov] Found ${urls.length} articles in ${category}`);
    for (const url of urls) {
      if (!allArticleUrls.includes(url)) {
        allArticleUrls.push(url);
      }
    }
  }

  console.log(`[dalat-gov] Total unique articles to fetch: ${allArticleUrls.length}`);

  // Fetch articles with rate limiting
  const articles: GovArticle[] = [];
  for (const url of allArticleUrls.slice(0, 30)) {
    // Limit to 30 articles per run
    const article = await fetchArticle(url);
    if (article) {
      articles.push(article);
    }
    // Small delay to be respectful
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return articles;
}

/**
 * Process gov.vn articles and import extracted events
 */
export async function processGovArticles(
  supabase: SupabaseClient,
  articles: GovArticle[],
  createdBy?: string
): Promise<ProcessResult> {
  const result = createEmptyResult();

  for (const article of articles) {
    try {
      // Check if we've already processed this article
      if (await checkDuplicateByUrl(supabase, article.url)) {
        result.skipped++;
        result.details.push(`Skipped: Already processed - ${article.title}`);
        continue;
      }

      // Extract events using AI
      const events = await extractEventsFromArticle(article);

      if (events.length === 0) {
        result.details.push(`No events found in: ${article.title}`);
        continue;
      }

      console.log(`[dalat-gov] Found ${events.length} events in: ${article.title}`);

      // Insert events via the shared importer, then translate (server path)
      const imported = await importExtractedEvents(
        supabase,
        article,
        events,
        result,
        { createdBy }
      );
      for (const ev of imported) {
        const fieldsToTranslate = [];
        if (ev.title) {
          fieldsToTranslate.push({ field_name: "title" as const, text: ev.title });
        }
        if (ev.description) {
          fieldsToTranslate.push({
            field_name: "description" as const,
            text: ev.description,
          });
        }
        if (fieldsToTranslate.length > 0) {
          await triggerTranslationServer("event", ev.id, fieldsToTranslate);
        }
      }
    } catch (err) {
      result.errors++;
      result.details.push(`Exception processing article: ${article.url} - ${err}`);
    }
  }

  return result;
}
