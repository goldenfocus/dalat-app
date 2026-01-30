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

// Flip.vn event structure (extracted from HTML meta tags)
export interface FlipEvent {
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
  organizerId?: string;
  eventId?: string; // Flip's internal event ID
  tickets?: Array<{
    name: string;
    price: number;
    currency: string;
  }>;
}

/**
 * Options for fetching Flip events
 */
export interface FlipFetchOptions {
  /** Override date for multi-showtime events (ISO 8601 or YYYY-MM-DD) */
  dateOverride?: string;
  /** Override time (HH:MM format, Vietnam time) */
  timeOverride?: string;
}

/**
 * Fetch and parse a Flip.vn event page
 * Extracts data from Open Graph meta tags and embedded page data
 *
 * @param eventUrl - The Flip.vn event URL
 * @param options - Optional overrides for date/time (useful for multi-showtime events)
 */
export async function fetchFlipEvent(
  eventUrl: string,
  options?: FlipFetchOptions
): Promise<FlipEvent | null> {
  try {
    const response = await fetch(eventUrl, {
      headers: {
        "Accept": "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Flip fetch error: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract Open Graph meta tags
    const getMetaContent = (property: string): string | null => {
      // Match property="og:xxx" content="value" or content="value" property="og:xxx"
      const match = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'));
      return match?.[1] ? decodeHtmlEntities(match[1]) : null;
    };

    const getMetaName = (name: string): string | null => {
      const match = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i'));
      return match?.[1] ? decodeHtmlEntities(match[1]) : null;
    };

    // Get title from OG tags
    const title = getMetaContent('og:title');
    if (!title) {
      console.error("Flip: Could not extract event title from", eventUrl);
      return null;
    }

    // Get description from OG tags
    const rawDescription = getMetaContent('og:description') || getMetaName('description');

    // Description format: "T6, 31/10/2025 • 12:00 - 15:30 tại Capital Theatre. Mua vé..."
    // Or multi-showtime: "Nhiều khung giờ tại Venue Name. Mua vé..."
    const parsed = parseFlipDescription(rawDescription);

    // Check if date override is provided (for multi-showtime events)
    let startDate: string | null = parsed.startDate;
    let endDate: string | null = parsed.endDate;

    if (options?.dateOverride) {
      // Parse the override date
      const overrideResult = parseDateOverride(options.dateOverride, options.timeOverride);
      if (overrideResult) {
        startDate = overrideResult.startDate;
        endDate = overrideResult.endDate;
        console.log(`Flip: Using date override: ${startDate}`);
      }
    }

    // Extract venue from "tại" pattern even if no date
    let venue = parsed.venue;
    if (!venue && rawDescription) {
      // Try to extract venue from multi-showtime format: "Nhiều khung giờ tại Venue Name"
      const multiShowVenueMatch = rawDescription.match(/tại\s+([^.]+?)(?:\.\s*Mua|$)/i);
      venue = multiShowVenueMatch?.[1]?.trim() || null;
    }

    if (!startDate) {
      // Check if this is a multi-showtime event (no single date)
      if (rawDescription?.includes("Nhiều khung giờ")) {
        console.error("Flip: Multi-showtime event - provide dateOverride to import:", eventUrl);
      } else {
        console.error("Flip: Could not parse date from description:", rawDescription);
      }
      return null;
    }

    // Get image URL
    const imageUrl = getMetaContent('og:image');

    // Extract event ID from URL (e.g., "korea-spotlight-in-vietnam-showcase-1568153199")
    const urlMatch = eventUrl.match(/events\/([^/]+?)(?:-(\d+))?$/);
    const eventId = urlMatch?.[2];

    // Extract city from venue if possible
    const city = extractCity(venue ?? undefined);

    // Clean up title - remove "| Flip" suffix if present
    const cleanTitle = title.replace(/\s*\|\s*Flip\s*$/i, '').trim();

    return {
      url: eventUrl,
      title: cleanTitle,
      description: undefined, // Description is mostly just date/venue, not useful
      startDate,
      endDate: endDate ?? undefined,
      venue: venue ?? undefined,
      city,
      imageUrl: imageUrl || undefined,
      eventId,
    };
  } catch (error) {
    console.error("Flip fetch error:", error);
    return null;
  }
}

/**
 * Parse a date override string into ISO format
 * Supports: YYYY-MM-DD, DD/MM/YYYY, ISO 8601
 */
function parseDateOverride(
  dateStr: string,
  timeStr?: string
): { startDate: string; endDate: string | null } | null {
  try {
    let year: number, month: number, day: number;

    // Try ISO format first (YYYY-MM-DD or full ISO)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      const isoDate = new Date(dateStr);
      if (!isNaN(isoDate.getTime())) {
        // If time provided, use it; otherwise use the time from ISO string or default to 19:00
        if (timeStr) {
          const [hours, minutes] = timeStr.split(':').map(Number);
          isoDate.setHours(hours, minutes, 0, 0);
        } else if (!dateStr.includes('T')) {
          // No time in ISO string, default to 19:00 Vietnam time
          isoDate.setHours(19, 0, 0, 0);
        }
        // Convert from Vietnam time to UTC
        const utcDate = new Date(isoDate.getTime() - 7 * 60 * 60 * 1000);
        return { startDate: utcDate.toISOString(), endDate: null };
      }
    }

    // Try DD/MM/YYYY format (common in Vietnam)
    const vnMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (vnMatch) {
      day = parseInt(vnMatch[1], 10);
      month = parseInt(vnMatch[2], 10) - 1;
      year = parseInt(vnMatch[3], 10);
    } else {
      return null;
    }

    // Default time: 19:00 (7 PM) if not provided
    let hours = 19;
    let minutes = 0;
    if (timeStr) {
      const timeParts = timeStr.split(':').map(Number);
      hours = timeParts[0] || 19;
      minutes = timeParts[1] || 0;
    }

    // Create date in Vietnam time, then convert to UTC
    const localDate = new Date(year, month, day, hours, minutes);
    const utcDate = new Date(localDate.getTime() - 7 * 60 * 60 * 1000);

    return { startDate: utcDate.toISOString(), endDate: null };
  } catch {
    return null;
  }
}

/**
 * Parse Flip.vn description format to extract date, time, and venue
 * Format: "T6, 31/10/2025 • 12:00 - 15:30 tại Capital Theatre. Mua vé..."
 *         "T7, 22/11/2025 • 03:30 - 16:00 tại SECC – Outdoor, TP.HCM. Mua vé..."
 */
function parseFlipDescription(description: string | null): {
  startDate: string | null;
  endDate: string | null;
  venue: string | null;
} {
  if (!description) {
    return { startDate: null, endDate: null, venue: null };
  }

  // Match date pattern: "T6, 31/10/2025" or "Th 2, 01/01/2025"
  // Vietnamese days: T2-CN (Thứ 2 - Chủ Nhật) or T2-T7, CN
  const dateMatch = description.match(/(?:T\d|Th\s?\d|CN),?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);

  // Match time pattern: "12:00 - 15:30" or "12:00" (single time)
  const timeMatch = description.match(/(\d{1,2}):(\d{2})\s*(?:-\s*(\d{1,2}):(\d{2}))?/);

  // Match venue: "tại Venue Name" - capture until period or "Mua vé"
  const venueMatch = description.match(/tại\s+([^.]+?)(?:\.\s*Mua|$)/i);

  let startDate: string | null = null;
  let endDate: string | null = null;
  let venue: string | null = venueMatch?.[1]?.trim() || null;

  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // JS months are 0-indexed
    const year = parseInt(dateMatch[3], 10);

    // Default time if not found
    let startHour = 0;
    let startMinute = 0;
    let endHour: number | null = null;
    let endMinute: number | null = null;

    if (timeMatch) {
      startHour = parseInt(timeMatch[1], 10);
      startMinute = parseInt(timeMatch[2], 10);
      if (timeMatch[3] && timeMatch[4]) {
        endHour = parseInt(timeMatch[3], 10);
        endMinute = parseInt(timeMatch[4], 10);
      }
    }

    // Create dates in Vietnam timezone (UTC+7)
    // We'll create as if local, then adjust - Flip shows Vietnam local time
    const startLocal = new Date(year, month, day, startHour, startMinute);
    // Convert Vietnam local to UTC by subtracting 7 hours
    const startUtc = new Date(startLocal.getTime() - 7 * 60 * 60 * 1000);
    startDate = startUtc.toISOString();

    if (endHour !== null && endMinute !== null) {
      const endLocal = new Date(year, month, day, endHour, endMinute);
      const endUtc = new Date(endLocal.getTime() - 7 * 60 * 60 * 1000);
      endDate = endUtc.toISOString();
    }
  }

  return { startDate, endDate, venue };
}

/**
 * Fetch Flip.vn events listing and extract event URLs
 * Returns array of event page URLs to scrape
 */
export async function discoverFlipEvents(
  searchUrl: string = "https://flip.vn/events"
): Promise<string[]> {
  try {
    const response = await fetch(searchUrl, {
      headers: {
        "Accept": "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Flip discovery error: ${response.status}`);
      return [];
    }

    const html = await response.text();

    // Extract event URLs from listing page
    // Pattern: /events/event-slug-12345 or https://flip.vn/events/event-slug-12345
    const eventUrls: string[] = [];
    const urlMatches = html.matchAll(/href=["']((?:https:\/\/flip\.vn)?\/events\/[a-z0-9-]+-\d+)["']/gi);

    for (const match of urlMatches) {
      let url = match[1];
      // Ensure full URL
      if (url.startsWith('/')) {
        url = `https://flip.vn${url}`;
      }
      if (!eventUrls.includes(url)) {
        eventUrls.push(url);
      }
    }

    console.log(`Flip discovery: Found ${eventUrls.length} events from ${searchUrl}`);
    return eventUrls;
  } catch (error) {
    console.error("Flip discovery error:", error);
    return [];
  }
}

/**
 * Process scraped Flip.vn events into the events table
 */
export async function processFlipEvents(
  supabase: SupabaseClient,
  events: FlipEvent[],
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

      const { data: newEvent, error } = await supabase.from("events").insert({
        slug,
        title: event.title,
        description: event.description,
        starts_at: event.startDate,
        ends_at: event.endDate,
        location_name: event.venue,
        external_chat_url: event.url, // Store original Flip URL for "Get Tickets" link
        image_url: imageUrl,
        status: "published",
        timezone: "Asia/Ho_Chi_Minh",
        organizer_id: organizerId,
        created_by: createdBy,
        source_platform: "flip",
        source_metadata: {
          flip_event_id: event.eventId,
          flip_organizer_id: event.organizerId,
          tickets: event.tickets,
          imported_at: new Date().toISOString(),
        },
      }).select("id").single();

      if (error) {
        result.errors++;
        result.details.push(`Error: ${event.title} - ${error.message}`);
      } else {
        result.processed++;

        // Trigger translation to all 12 languages
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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#x27;/g, "'");
}

function extractCity(venue?: string): string | undefined {
  if (!venue) return undefined;

  // Common Vietnamese city patterns in venue strings
  const cityPatterns: Array<{ pattern: RegExp; city: string }> = [
    { pattern: /TP\.?\s*HCM|Hồ Chí Minh|Ho Chi Minh|Saigon|Sài Gòn/i, city: "TP.HCM" },
    { pattern: /Hà Nội|Ha Noi|Hanoi/i, city: "Hà Nội" },
    { pattern: /Đà Nẵng|Da Nang/i, city: "Đà Nẵng" },
    { pattern: /Đà Lạt|Da Lat|Dalat/i, city: "Đà Lạt" },
    { pattern: /Nha Trang/i, city: "Nha Trang" },
    { pattern: /Huế|Hue/i, city: "Huế" },
    { pattern: /Hải Phòng|Hai Phong/i, city: "Hải Phòng" },
    { pattern: /Cần Thơ|Can Tho/i, city: "Cần Thơ" },
    { pattern: /Vũng Tàu|Vung Tau/i, city: "Vũng Tàu" },
    { pattern: /Quy Nhơn|Quy Nhon/i, city: "Quy Nhơn" },
  ];

  for (const { pattern, city } of cityPatterns) {
    if (pattern.test(venue)) {
      return city;
    }
  }

  return undefined;
}
