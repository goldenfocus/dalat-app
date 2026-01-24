import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { processFacebookEvents } from "@/lib/import/processors/facebook";
import { processEventbriteEvents } from "@/lib/import/processors/eventbrite";
import { processLumaEvents, type LumaEvent } from "@/lib/import/processors/luma";
import type { FacebookEvent, EventbriteEvent } from "@/lib/import/types";

// Extend timeout for Vercel Pro (scrapers can be slow)
export const maxDuration = 60;

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
  try {
    // Get authenticated user (import requires login)
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { url } = await request.json();

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
        actorId = "data-slayer/facebook-search-events";
        isFacebookSearch = true;
      } else {
        actorId = "pratikdani/facebook-event-scraper";
      }
    } else if (url.includes("eventbrite.com")) {
      platform = "eventbrite";
      actorId = "newpo/eventbrite-scraper";
    } else if (url.includes("lu.ma") || url.includes("luma.com")) {
      platform = "luma";
      actorId = ""; // Not used - we fetch Lu.ma directly
    } else if (url.includes("setkyar.com")) {
      platform = "setkyar";
      actorId = ""; // Not used - we fetch directly via OpenGraph
    } else {
      return NextResponse.json(
        { error: "Unsupported URL. Supported: facebook.com, eventbrite.com, lu.ma/luma.com" },
        { status: 400 }
      );
    }

    console.log(`URL Import: Starting ${platform} scrape for ${url}${isFacebookSearch ? " (search results)" : ""}`);

    let items: unknown[];

    if (platform === "luma") {
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
    } else if (platform === "setkyar") {
      // Fetch setkyar.com directly via OpenGraph scraping
      const setkyarData = await fetchSetkyarEvent(url);
      if (!setkyarData) {
        return NextResponse.json(
          { error: "Could not fetch event data" },
          { status: 404 }
        );
      }
      items = [setkyarData];
      console.log(`URL Import: Got event: ${setkyarData.title}`);
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
      const apifyInput = isFacebookSearch
        ? {
            startUrls: [{ url }],
            maxResults: 50, // Limit to 50 events per search
          }
        : {
            startUrls: [{ url }],
            maxRequestsPerCrawl: 1,
          };

      const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`;

      console.log(`URL Import: Calling Apify actor "${actorId}" with input:`, JSON.stringify(apifyInput, null, 2));

      // Use AbortController to enforce our own timeout (50s to leave buffer before Vercel's 60s limit)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50000);

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
    } else if (platform === "luma" || platform === "setkyar") {
      // Both Lu.ma and setkyar use similar OpenGraph-based data structure
      result = await processLumaEvents(supabase, items as LumaEvent[], user.id, platform);
    } else {
      result = await processEventbriteEvents(supabase, items as EventbriteEvent[], user.id);
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
    return NextResponse.json(
      { error: "Failed to import event" },
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
 * Fetch event from setkyar.com by scraping OpenGraph meta tags
 * This is a quiet, undocumented import source
 */
async function fetchSetkyarEvent(eventUrl: string) {
  try {
    const response = await fetch(eventUrl, {
      headers: {
        "Accept": "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Setkyar page fetch error: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract OpenGraph meta tags
    const getMetaContent = (property: string): string | null => {
      const match = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i'));
      return match?.[1] || null;
    };

    const getMetaName = (name: string): string | null => {
      const match = html.match(new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i'));
      return match?.[1] || null;
    };

    // Get basic event info from OpenGraph tags
    const title = getMetaContent("og:title") || getMetaName("title");
    if (!title) {
      console.error("Setkyar: Could not extract event title");
      return null;
    }

    const description = getMetaContent("og:description") || getMetaName("description");
    const imageUrl = getMetaContent("og:image");

    // Try to extract date/time from page content (look for common patterns)
    // This is best-effort since the page uses client-side rendering
    let startDate = null;
    let endDate = null;

    // Look for ISO date patterns in the HTML
    const isoDateMatch = html.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    if (isoDateMatch) {
      startDate = isoDateMatch[1];
    }

    // Try to find organizer name from page content
    let organizer = null;
    const organizerMatch = html.match(/"organizer"[:\s]*["']([^"']+)["']/i)
      || html.match(/hosted\s+by\s+([^<]+)/i);
    if (organizerMatch) {
      organizer = organizerMatch[1].trim();
    }

    console.log(`Setkyar: Extracted - title: "${title}", image: ${imageUrl ? "yes" : "no"}, date: ${startDate || "unknown"}`);

    return {
      url: eventUrl,
      title: title,
      name: title,
      description: description,
      start: startDate,
      end: endDate,
      startDate: startDate,
      endDate: endDate,
      location: null, // Not available from OpenGraph
      venue: null,
      address: null,
      city: null,
      latitude: null,
      longitude: null,
      organizer: organizer,
      hostName: organizer,
      imageUrl: imageUrl,
      coverImage: imageUrl,
      attendeeCount: null,
      isFree: true,
      price: null,
    };
  } catch (error) {
    console.error("Setkyar fetch error:", error);
    return null;
  }
}
