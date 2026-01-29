import { SupabaseClient } from "@supabase/supabase-js";
import {
  slugify,
  generateUniqueSlug,
  findOrCreateOrganizer,
  checkDuplicateByUrl,
  createEmptyResult,
  downloadAndUploadImage,
  type ProcessResult,
} from "../utils";
import { triggerTranslationServer } from "@/lib/translations";

// TicketGo event structure (from JSON-LD + HTML scraping)
export interface TicketGoEvent {
  url: string;
  title: string;
  description?: string;
  startDate: string; // ISO 8601
  endDate?: string;
  venue?: string;
  address?: string;
  city?: string;
  imageUrl?: string;
  organizer?: string;
  tickets?: Array<{
    name: string;
    price: number;
    currency: string;
    availability: string;
  }>;
  performers?: string[];
}

/**
 * Fetch and parse a TicketGo event page
 * Extracts JSON-LD structured data + HTML fallback
 */
export async function fetchTicketGoEvent(eventUrl: string): Promise<TicketGoEvent | null> {
  try {
    const response = await fetch(eventUrl, {
      headers: {
        "Accept": "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`TicketGo fetch error: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    let jsonLd: Record<string, unknown> | null = null;

    if (jsonLdMatch) {
      try {
        jsonLd = JSON.parse(jsonLdMatch[1]);
      } catch {
        console.warn("TicketGo: Failed to parse JSON-LD");
      }
    }

    // Extract Open Graph meta tags as fallback
    const getMetaContent = (property: string): string | null => {
      const match = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'));
      return match?.[1] || null;
    };

    // Get title from JSON-LD or OG tags
    const title = (jsonLd?.name as string)
      || getMetaContent('og:title')
      || extractFromHtml(html, /<h1[^>]*class="[^"]*event-title[^"]*"[^>]*>([^<]+)<\/h1>/);

    if (!title) {
      console.error("TicketGo: Could not extract event title");
      return null;
    }

    // Get description
    const description = (jsonLd?.description as string)
      || getMetaContent('og:description')
      || extractFromHtml(html, /<div[^>]*class="[^"]*event-description[^"]*"[^>]*>([\s\S]*?)<\/div>/);

    // Get dates from JSON-LD
    const startDate = (jsonLd?.startDate as string) || null;
    const endDate = (jsonLd?.endDate as string) || null;

    // Get location
    const location = jsonLd?.location as Record<string, unknown> | undefined;
    const venue = (location?.name as string) || extractFromHtml(html, /Địa điểm[^:]*:[^<]*<[^>]*>([^<]+)/);
    const address = (location?.address as Record<string, unknown>)?.streetAddress as string
      || extractFromHtml(html, /<span[^>]*class="[^"]*venue-address[^"]*"[^>]*>([^<]+)/);

    // Get image
    const imageUrl = (jsonLd?.image as string)
      || getMetaContent('og:image')
      || extractFromHtml(html, /<img[^>]*class="[^"]*event-cover[^"]*"[^>]*src="([^"]+)"/);

    // Get organizer
    const organizer = (jsonLd?.organizer as Record<string, unknown>)?.name as string
      || extractFromHtml(html, /Đơn vị tổ chức[^:]*:[^<]*<[^>]*>([^<]+)/);

    // Extract ticket prices from JSON-LD offers
    const tickets: TicketGoEvent["tickets"] = [];
    const offers = jsonLd?.offers;
    if (Array.isArray(offers)) {
      for (const offer of offers) {
        tickets.push({
          name: (offer as Record<string, unknown>).name as string || "Standard",
          price: parseFloat((offer as Record<string, unknown>).price as string) || 0,
          currency: ((offer as Record<string, unknown>).priceCurrency as string) || "VND",
          availability: ((offer as Record<string, unknown>).availability as string)?.includes("InStock")
            ? "available"
            : "sold_out",
        });
      }
    }

    // Extract performers if available
    const performers: string[] = [];
    const performerMatches = html.matchAll(/class="[^"]*performer[^"]*"[^>]*>([^<]+)/gi);
    for (const match of performerMatches) {
      performers.push(match[1].trim());
    }

    return {
      url: eventUrl,
      title: decodeHtmlEntities(title),
      description: description ? decodeHtmlEntities(description) : undefined,
      startDate: startDate || new Date().toISOString(),
      endDate: endDate || undefined,
      venue: venue || undefined,
      address: address || undefined,
      city: extractCity(address || undefined),
      imageUrl: imageUrl || undefined,
      organizer: organizer || undefined,
      tickets: tickets.length > 0 ? tickets : undefined,
      performers: performers.length > 0 ? performers : undefined,
    };
  } catch (error) {
    console.error("TicketGo fetch error:", error);
    return null;
  }
}

/**
 * Fetch TicketGo listing page and extract event URLs
 * Used for daily discovery scraping
 */
export async function discoverTicketGoEvents(
  searchUrl: string = "https://ticketgo.vn/khu-vuc/da-lat"
): Promise<string[]> {
  try {
    const response = await fetch(searchUrl, {
      headers: {
        "Accept": "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`TicketGo discovery error: ${response.status}`);
      return [];
    }

    const html = await response.text();

    // Extract event URLs from listing page
    const eventUrls: string[] = [];
    const urlMatches = html.matchAll(/href="(https:\/\/ticketgo\.vn\/event\/[^"]+)"/g);

    for (const match of urlMatches) {
      const url = match[1];
      if (!eventUrls.includes(url)) {
        eventUrls.push(url);
      }
    }

    console.log(`TicketGo discovery: Found ${eventUrls.length} events`);
    return eventUrls;
  } catch (error) {
    console.error("TicketGo discovery error:", error);
    return [];
  }
}

/**
 * Process scraped TicketGo events into the events table
 */
export async function processTicketGoEvents(
  supabase: SupabaseClient,
  events: TicketGoEvent[],
  createdBy?: string
): Promise<ProcessResult> {
  const result = createEmptyResult();

  for (const event of events) {
    try {
      if (!event.title || !event.startDate) {
        result.skipped++;
        result.details.push(`Skipped: Missing title or date - ${event.url}`);
        continue;
      }

      // Check for duplicates by source URL
      if (await checkDuplicateByUrl(supabase, event.url)) {
        result.skipped++;
        result.details.push(`Skipped: Duplicate - ${event.title}`);
        continue;
      }

      const organizerId = await findOrCreateOrganizer(supabase, event.organizer);
      const slug = await generateUniqueSlug(supabase, slugify(event.title));

      // Download and re-upload image to our storage
      const imageUrl = await downloadAndUploadImage(supabase, event.imageUrl, slug);

      // Calculate price range for display
      const priceInfo = event.tickets?.length
        ? {
            min_price: Math.min(...event.tickets.map((t) => t.price)),
            max_price: Math.max(...event.tickets.map((t) => t.price)),
            currency: event.tickets[0].currency,
            tickets: event.tickets,
          }
        : null;

      const { data: newEvent, error } = await supabase.from("events").insert({
        slug,
        title: event.title,
        description: event.description,
        starts_at: event.startDate,
        ends_at: event.endDate,
        location_name: event.venue,
        address: event.address,
        external_chat_url: event.url, // Store original URL
        image_url: imageUrl,
        status: "published",
        timezone: "Asia/Ho_Chi_Minh",
        organizer_id: organizerId,
        created_by: createdBy,
        source_platform: "ticketgo",
        source_metadata: {
          performers: event.performers,
          price_info: priceInfo,
          imported_at: new Date().toISOString(),
        },
      }).select("id").single();

      if (error) {
        result.errors++;
        result.details.push(`Error: ${event.title} - ${error.message}`);
      } else {
        result.processed++;

        // Trigger translation to all 12 languages
        // Must await to ensure translation completes before serverless function terminates
        if (newEvent?.id) {
          const fieldsToTranslate = [];
          if (event.title) {
            fieldsToTranslate.push({ field_name: "title" as const, text: event.title });
          }
          if (event.description) {
            fieldsToTranslate.push({ field_name: "description" as const, text: event.description });
          }

          if (fieldsToTranslate.length > 0) {
            await triggerTranslationServer("event", newEvent.id, fieldsToTranslate);
          }
        }
      }
    } catch (err) {
      result.errors++;
      result.details.push(`Exception: ${event.url} - ${err}`);
    }
  }

  return result;
}

// Helper functions

function extractFromHtml(html: string, regex: RegExp): string | null {
  const match = html.match(regex);
  return match?.[1]?.trim() || null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—");
}

function extractCity(address?: string): string | undefined {
  if (!address) return undefined;

  // Common Vietnamese city names
  const cities = [
    "Hà Nội", "Hanoi", "TP.HCM", "Hồ Chí Minh", "Ho Chi Minh",
    "Đà Nẵng", "Da Nang", "Đà Lạt", "Da Lat", "Nha Trang",
    "Huế", "Hue", "Hải Phòng", "Hai Phong", "Cần Thơ", "Can Tho",
  ];

  for (const city of cities) {
    if (address.toLowerCase().includes(city.toLowerCase())) {
      return city;
    }
  }

  return undefined;
}
