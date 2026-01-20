import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processFacebookEvents } from "@/lib/import/processors/facebook";
import { processEventbriteEvents } from "@/lib/import/processors/eventbrite";
import { processLumaEvents, type LumaEvent } from "@/lib/import/processors/luma";
import type { FacebookEvent, EventbriteEvent } from "@/lib/import/types";

// Extend timeout for Vercel Pro (scrapers can be slow)
export const maxDuration = 60;

/**
 * Import a single event from a URL
 * Uses Apify to scrape the event, then processes it through our import pipeline
 */
export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    // Determine platform from URL
    let platform: string;
    let actorId: string;

    if (url.includes("facebook.com")) {
      platform = "facebook";
      actorId = "pratikdani~facebook-event-scraper";
    } else if (url.includes("eventbrite.com")) {
      platform = "eventbrite";
      actorId = "newpo~eventbrite-scraper";
    } else if (url.includes("lu.ma") || url.includes("luma.com")) {
      platform = "luma";
      actorId = ""; // Not used - we fetch Lu.ma directly
    } else {
      return NextResponse.json(
        { error: "Unsupported URL. Supported: facebook.com, eventbrite.com, lu.ma/luma.com" },
        { status: 400 }
      );
    }

    console.log(`URL Import: Starting ${platform} scrape for ${url}`);

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
    } else {
      // Use Apify for Facebook/Eventbrite
      const apiToken = process.env.APIFY_API_TOKEN;
      if (!apiToken) {
        return NextResponse.json(
          { error: "Apify not configured" },
          { status: 503 }
        );
      }

      const apifyInput = {
        startUrls: [{ url }],
        maxRequestsPerCrawl: 1,
      };

      const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`;

      const runResponse = await fetch(apifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apifyInput),
      });

      if (!runResponse.ok) {
        const errorText = await runResponse.text();
        console.error(`URL Import: Apify error - ${runResponse.status}`, errorText);
        return NextResponse.json(
          { error: `Failed to scrape URL: ${errorText.slice(0, 200)}` },
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
      result = await processFacebookEvents(supabase, items as FacebookEvent[]);
    } else if (platform === "luma") {
      result = await processLumaEvents(supabase, items as LumaEvent[]);
    } else {
      result = await processEventbriteEvents(supabase, items as EventbriteEvent[]);
    }

    console.log(
      `URL Import: Processed ${result.processed}, skipped ${result.skipped}, errors ${result.errors}`
    );

    if (result.processed > 0) {
      // Get the created event by external URL
      const { data: event } = await supabase
        .from("events")
        .select("slug, title")
        .eq("external_chat_url", url)
        .single();

      return NextResponse.json({
        success: true,
        title: event?.title || items[0].name || "Event",
        slug: event?.slug,
      });
    } else if (result.skipped > 0) {
      return NextResponse.json(
        { error: "Event already exists or is missing required data" },
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
      { error: error instanceof Error ? error.message : "Unknown error" },
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
