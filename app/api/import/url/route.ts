import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { processFacebookEvents } from "@/lib/import/processors/facebook";
import { processLumaEvents, type LumaEvent } from "@/lib/import/processors/luma";
import { fetchTicketGoEvent, processTicketGoEvents, type TicketGoEvent } from "@/lib/import/processors/ticketgo";
import { fetchFlipEvent, processFlipEvents, type FlipEvent } from "@/lib/import/processors/flip";
import type { FacebookEvent } from "@/lib/import/types";

// Extend timeout for Vercel Pro (scrapers can be slow)
// Facebook scraping can take 1-3 minutes depending on the event
export const maxDuration = 300;

/**
 * Validate URL to prevent SSRF attacks
 * Blocks internal networks, localhost, and metadata endpoints
 */
function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow http/https protocols
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block localhost and loopback
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return false;
    }

    // Block private/internal IP ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      // 10.x.x.x
      if (a === 10) return false;
      // 172.16.x.x - 172.31.x.x
      if (a === 172 && b >= 16 && b <= 31) return false;
      // 192.168.x.x
      if (a === 192 && b === 168) return false;
      // 169.254.x.x (link-local, includes AWS metadata)
      if (a === 169 && b === 254) return false;
    }

    // Block cloud metadata endpoints
    if (hostname === "metadata.google.internal" || hostname.endsWith(".internal")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Import a single event from a URL
 * Uses Apify to scrape the event, then processes it through our import pipeline
 */
export async function POST(request: Request) {
  console.log("URL Import: Starting POST handler");
  try {
    // Get authenticated user (import requires login)
    console.log("URL Import: Creating server client...");
    const serverSupabase = await createServerClient();
    console.log("URL Import: Getting user...");
    const { data: { user } } = await serverSupabase.auth.getUser();
    console.log("URL Import: User check complete, authenticated:", !!user);

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { url, date, time } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    // Validate URL to prevent SSRF attacks
    if (!isUrlSafe(url)) {
      return NextResponse.json({ error: "Invalid or unsafe URL" }, { status: 400 });
    }

    // Determine platform from URL
    let platform: string;
    let actorId: string;
    let isFacebookSearch = false;

    if (url.includes("facebook.com")) {
      platform = "facebook";
      // Check if this is a Facebook search URL
      if (url.includes("/search/events/") || url.includes("facebook.com/events/search/")) {
        // Use data-slayer scraper - works without login for search
        actorId = "data-slayer~facebook-search-events";
        isFacebookSearch = true;
      } else {
        actorId = "apify~facebook-events-scraper";
      }
    } else if (url.includes("ticketgo.vn")) {
      platform = "ticketgo";
      actorId = ""; // Not used - we fetch TicketGo directly via HTML scraping
    } else if (url.includes("flip.vn")) {
      platform = "flip";
      actorId = ""; // Not used - we fetch Flip directly via HTML scraping
    } else if (url.includes("lu.ma") || url.includes("luma.com")) {
      platform = "luma";
      actorId = ""; // Not used - we fetch Lu.ma directly
    } else {
      // Try generic API-based import for any URL with /events/ pattern
      platform = "generic";
      actorId = "";
    }

    console.log(`URL Import: Starting ${platform} scrape for ${url}${isFacebookSearch ? " (search results)" : ""}`);

    let items: unknown[];

    if (platform === "ticketgo") {
      // Fetch TicketGo directly via HTML scraping
      const ticketgoData = await fetchTicketGoEvent(url);
      if (!ticketgoData) {
        return NextResponse.json(
          { error: "Could not fetch TicketGo event. Make sure the URL is a valid event page." },
          { status: 404 }
        );
      }
      items = [ticketgoData];
      console.log(`URL Import: Got TicketGo event: ${ticketgoData.title}`);
    } else if (platform === "flip") {
      // Fetch Flip.vn directly via HTML scraping (Open Graph meta tags)
      // For multi-showtime events, date/time can be provided as override
      const flipData = await fetchFlipEvent(url, {
        dateOverride: date,
        timeOverride: time,
      });
      if (!flipData) {
        // Check if date was provided - give different error message
        if (!date) {
          return NextResponse.json(
            {
              error: "Could not import Flip.vn event. This may be a multi-showtime event. Try adding a 'date' parameter (e.g., '2026-03-15' or '15/03/2026') and optionally 'time' (e.g., '19:00').",
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: "Could not fetch Flip.vn event. Make sure the URL is valid and the date format is correct (YYYY-MM-DD or DD/MM/YYYY)." },
          { status: 400 }
        );
      }
      items = [flipData];
      console.log(`URL Import: Got Flip event: ${flipData.title}`);
    } else if (platform === "luma") {
      // Fetch Lu.ma directly - no Apify needed
      const lumaData = await fetchLumaEvent(url);
      if (!lumaData) {
        return NextResponse.json(
          { error: "Could not fetch Lu.ma event. Make sure the URL is a direct event link (e.g., lu.ma/abc123)" },
          { status: 404 }
        );
      }
      items = [lumaData];
      console.log(`URL Import: Got Lu.ma event: ${lumaData.title}`);
    } else if (platform === "generic") {
      // Try generic API-based import for unknown platforms
      const genericData = await fetchGenericEvent(url);
      if (!genericData) {
        return NextResponse.json(
          { error: "Could not fetch event. Supported platforms: Facebook, Flip.vn, TicketGo, Lu.ma, or sites with /events/ API" },
          { status: 400 }
        );
      }
      items = [genericData];
      console.log(`URL Import: Got event: ${genericData.title}`);
    } else {
      // Use Apify for Facebook/Eventbrite
      const apiToken = process.env.APIFY_API_TOKEN;
      if (!apiToken) {
        return NextResponse.json(
          { error: "Apify not configured" },
          { status: 503 }
        );
      }

      // Configure input based on whether it's a search URL or single event
      // Note: startUrls must be an array of strings, not objects with url property
      const apifyInput = isFacebookSearch
        ? {
            startUrls: [url],
            maxResults: 50, // Limit to 50 events per search
          }
        : {
            startUrls: [url],
            maxRequestsPerCrawl: 1,
          };

      const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`;

      console.log(`URL Import: Calling Apify actor "${actorId}"`);
      console.log(`URL Import: Input:`, JSON.stringify(apifyInput, null, 2));
      console.log(`URL Import: API URL (token masked):`, apifyUrl.replace(apiToken, "***"));

      // Use AbortController to enforce our own timeout (280s to leave buffer before Vercel's 300s limit)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 280000);

      let runResponse: Response;
      try {
        runResponse = await fetch(apifyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apifyInput),
          signal: controller.signal,
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          console.error("URL Import: Apify request timed out after 50s");
          return NextResponse.json(
            {
              error: "Facebook scraping timed out. This can happen with complex event pages.",
              details: "Try again, or if this persists, the Facebook event page may be inaccessible to scrapers."
            },
            { status: 504 }
          );
        }
        throw fetchError;
      }
      clearTimeout(timeoutId);

      // Check Content-Type before parsing - Apify sometimes returns HTML on errors
      const contentType = runResponse.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const responseText = await runResponse.text();
        console.error(`URL Import: Apify returned non-JSON response`, {
          actorId,
          url,
          contentType,
          status: runResponse.status,
          bodyPreview: responseText.substring(0, 500),
        });

        // Detect common error patterns
        if (responseText.includes("<!DOCTYPE") || responseText.includes("<html")) {
          return NextResponse.json(
            {
              error: "Facebook scraper returned an error page instead of data.",
              details: "The scraper may be rate-limited or the event page requires login. Try again later."
            },
            { status: 502 }
          );
        }

        return NextResponse.json(
          { error: "Unexpected response from scraper. Please try again." },
          { status: 502 }
        );
      }

      if (!runResponse.ok) {
        const errorData = await runResponse.json().catch(() => ({}));
        console.error(`URL Import: Apify error - ${runResponse.status}`, {
          actorId,
          url,
          errorData,
        });

        // Extract meaningful error message from Apify response
        const errorMessage = errorData?.error?.message || errorData?.message || "Failed to scrape event";
        return NextResponse.json(
          {
            error: errorMessage,
            details: runResponse.status === 402
              ? "Apify credits may be exhausted."
              : "Please try again or check the URL."
          },
          { status: 502 }
        );
      }

      items = await runResponse.json();

      if (!items || items.length === 0) {
        return NextResponse.json(
          { error: "No event data found at URL" },
          { status: 404 }
        );
      }

      console.log(`URL Import: Got ${items.length} items from Apify`);
    }

    // Process the scraped event
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let result;
    if (platform === "facebook") {
      result = await processFacebookEvents(supabase, items as FacebookEvent[], user.id);
    } else if (platform === "ticketgo") {
      result = await processTicketGoEvents(supabase, items as TicketGoEvent[], user.id);
    } else if (platform === "flip") {
      result = await processFlipEvents(supabase, items as FlipEvent[], user.id);
    } else {
      // Lu.ma and generic imports use similar API-based data structure
      result = await processLumaEvents(supabase, items as LumaEvent[], user.id, platform);
    }

    console.log(
      `URL Import: Processed ${result.processed}, skipped ${result.skipped}, errors ${result.errors}`
    );

    if (result.processed > 0) {
      // For search results (multiple events), return summary stats
      if (isFacebookSearch) {
        return NextResponse.json({
          success: true,
          title: `Imported ${result.processed} event${result.processed > 1 ? "s" : ""}`,
          message: `${result.processed} imported, ${result.skipped} skipped, ${result.errors} errors`,
          count: result.processed,
          isMultiple: true,
        });
      }

      // For single events, get the created event details
      const { data: event } = await supabase
        .from("events")
        .select("slug, title")
        .eq("external_chat_url", url)
        .single();

      return NextResponse.json({
        success: true,
        title: event?.title || (items[0] as { name?: string })?.name || "Event",
        slug: event?.slug,
      });
    } else if (result.skipped > 0) {
      return NextResponse.json(
        { error: isFacebookSearch ? `${result.skipped} events already exist or missing data` : "Event already exists or is missing required data" },
        { status: 409 }
      );
    } else {
      return NextResponse.json(
        { error: result.details?.[0] || "Failed to process event" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("URL Import error:", error);
    console.error("URL Import error stack:", error instanceof Error ? error.stack : "No stack");
    return NextResponse.json(
      { error: "Failed to import event", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * Fetch Lu.ma event by scraping the page HTML
 * Lu.ma embeds event data as JSON in their HTML pages
 */
async function fetchLumaEvent(eventUrl: string) {
  try {
    // Fetch the Lu.ma page directly
    const response = await fetch(eventUrl, {
      headers: {
        "Accept": "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Lu.ma page fetch error: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract event data from the page - Lu.ma embeds it as JSON
    // Look for "event":{...} pattern in the HTML
    const eventMatch = html.match(/"event":\s*(\{[^}]+(?:\{[^}]*\}[^}]*)*\})/);
    if (!eventMatch) {
      console.error("Lu.ma: Could not find event data in page");
      return null;
    }

    // Parse the event JSON (it may be partial, so we extract key fields)
    const eventJson = eventMatch[1];

    // Extract individual fields using regex (more robust than JSON.parse for partial data)
    const getName = (json: string) => json.match(/"name":"([^"]+)"/)?.[1];
    const getField = (json: string, field: string) => {
      const match = json.match(new RegExp(`"${field}":"([^"]+)"`));
      return match?.[1];
    };

    const name = getName(eventJson);
    if (!name) {
      console.error("Lu.ma: Could not extract event name");
      return null;
    }

    // Also try to get host/organizer info
    const hostMatch = html.match(/"hosts":\s*\[([^\]]+)\]/);
    let hostName = null;
    if (hostMatch) {
      hostName = hostMatch[1].match(/"name":"([^"]+)"/)?.[1];
    }

    // Get description - might be in description_md or description
    const descMatch = html.match(/"description(?:_md)?":"((?:[^"\\]|\\.)*)"/);
    const description = descMatch?.[1]?.replace(/\\n/g, '\n').replace(/\\"/g, '"');

    // Get location info
    const locationMatch = html.match(/"geo_address_info":\s*\{([^}]+)\}/);
    let address = null;
    let city = null;
    if (locationMatch) {
      address = locationMatch[1].match(/"full_address":"([^"]+)"/)?.[1];
      city = locationMatch[1].match(/"city":"([^"]+)"/)?.[1];
    }

    const venueName = getField(html, "location_name") || getField(eventJson, "venue");

    return {
      url: eventUrl,
      title: name,
      name: name,
      description: description,
      start: getField(eventJson, "start_at"),
      end: getField(eventJson, "end_at"),
      startDate: getField(eventJson, "start_at"),
      endDate: getField(eventJson, "end_at"),
      location: address || venueName,
      venue: venueName,
      address: address,
      city: city,
      latitude: null,
      longitude: null,
      organizer: hostName,
      hostName: hostName,
      imageUrl: getField(eventJson, "cover_url"),
      coverImage: getField(eventJson, "cover_url"),
      attendeeCount: null,
      isFree: true, // Default to free
      price: null,
    };
  } catch (error) {
    console.error("Lu.ma fetch error:", error);
    return null;
  }
}

/**
 * Parse Slate.js rich text JSON format into plain text
 * Handles nested nodes recursively and preserves paragraph breaks
 */
function parseRichTextDescription(content: unknown): string {
  if (!content) return '';

  // If it's already a string, return it
  if (typeof content === 'string') {
    return content;
  }

  // If it's an array (Slate.js format), extract text from nodes
  if (Array.isArray(content)) {
    return extractTextFromSlateNodes(content);
  }

  // If it's a single node object
  if (typeof content === 'object' && content !== null) {
    return extractTextFromSlateNodes([content]);
  }

  return '';
}

/**
 * Recursively extract text from Slate.js nodes
 */
function extractTextFromSlateNodes(nodes: unknown[]): string {
  const blocks: string[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;

    const nodeObj = node as Record<string, unknown>;

    // If this node has direct text content
    if ('text' in nodeObj && typeof nodeObj.text === 'string') {
      blocks.push(nodeObj.text);
      continue;
    }

    // If this node has children, recursively extract
    if ('children' in nodeObj && Array.isArray(nodeObj.children)) {
      const childText = extractTextFromSlateNodes(nodeObj.children);
      if (childText) {
        blocks.push(childText);
      }
    }
  }

  // Join with newlines for block-level elements, spaces for inline
  return blocks.join('\n').trim();
}

/**
 * Fetch event from any platform that exposes an /api/events/{slug} endpoint
 */
async function fetchGenericEvent(eventUrl: string) {
  try {
    // Extract slug from URL: /events/[slug]
    const slugMatch = eventUrl.match(/\/events\/([^/?#]+)/);
    if (!slugMatch) {
      console.error("Generic import: Could not extract slug from URL");
      return null;
    }
    const slug = slugMatch[1];

    // Determine the base URL from the provided URL
    const urlObj = new URL(eventUrl);
    const apiUrl = `${urlObj.origin}/api/events/${slug}`;

    console.log(`Generic import: Fetching ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Generic import: API error ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Extract event data from API response
    const event = data.event || data;

    const title = event.title || event.name;
    if (!title) {
      console.error("Generic import: No title in API response");
      return null;
    }

    // Parse date - API may return various formats
    // eventDate: "2026-01-25T00:00:00.000Z", eventTime: "17:00"
    let startDate = event.startAt || event.start_at || event.startDate || event.eventDate || event.date;
    let endDate = event.endAt || event.end_at || event.endDate || event.eventEndDate;
    const startTime = event.startTime || event.eventTime;
    const endTime = event.endTime || event.eventEndTime;

    // If we have separate time, combine with date
    if (startTime && startDate) {
      // Extract just the date part if it's a full ISO string
      const dateOnly = startDate.split('T')[0];
      // Combine with time (assume local timezone)
      startDate = `${dateOnly}T${startTime}:00`;
    }
    if (endTime && endDate) {
      const dateOnly = endDate.split('T')[0];
      endDate = `${dateOnly}T${endTime}:00`;
    }

    // Get location info
    const location = event.location || event.venue || event.place;
    const locationName = typeof location === 'object'
      ? (location.name || location.title)
      : location;
    const address = typeof location === 'object'
      ? (location.address || location.fullAddress)
      : null;
    const mapsUrl = event.mapsUrl || event.googleMapsUrl || event.mapUrl ||
      (typeof location === 'object' ? location.mapsUrl : null);

    // Get organizer info
    const organizer = event.organizer || event.host || event.creator;
    const organizerName = typeof organizer === 'object'
      ? (organizer.name || organizer.displayName || organizer.username)
      : organizer;

    // Get description - may be plain text or rich text (Slate.js JSON)
    let description = event.description || event.body || event.content;
    // If description is an object (e.g., Slate.js JSON), parse it to plain text
    if (description && typeof description === 'object') {
      description = parseRichTextDescription(description);
    }
    // Also handle JSON string format (some APIs return Slate.js as serialized JSON string)
    if (description && typeof description === 'string' && description.startsWith('[{')) {
      try {
        const parsed = JSON.parse(description);
        if (Array.isArray(parsed)) {
          description = parseRichTextDescription(parsed);
        }
      } catch {
        // Not valid JSON, keep as-is
      }
    }

    console.log(`Generic import: Got "${title}" - date: ${startDate}, location: ${locationName}`);

    return {
      url: eventUrl,
      title: title,
      name: title,
      description,
      start: startDate,
      end: endDate,
      startDate: startDate,
      endDate: endDate,
      location: locationName,
      venue: locationName,
      address: address,
      city: event.city,
      latitude: event.latitude || (typeof location === 'object' ? location.lat : null),
      longitude: event.longitude || (typeof location === 'object' ? location.lng : null),
      organizer: organizerName,
      hostName: organizerName,
      imageUrl: event.image || event.coverImage || event.cover || event.imageUrl,
      coverImage: event.image || event.coverImage || event.cover,
      attendeeCount: event.attendeeCount || event.goingCount,
      isFree: event.isFree ?? (event.price === 0 || event.price === null),
      price: event.price,
      mapsUrl: mapsUrl,
      category: event.category,
    };
  } catch (error) {
    console.error("Generic import error:", error);
    return null;
  }
}
