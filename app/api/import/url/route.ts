import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processFacebookEvents } from "@/lib/import/processors/facebook";
import { processEventbriteEvents } from "@/lib/import/processors/eventbrite";
import { processLumaEvents } from "@/lib/import/processors/luma";

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
      result = await processFacebookEvents(supabase, items);
    } else if (platform === "luma") {
      result = await processLumaEvents(supabase, items);
    } else {
      result = await processEventbriteEvents(supabase, items);
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
 * Fetch Lu.ma event directly from their API
 * Lu.ma exposes event data at api.lu.ma/url?url=<event-url>
 */
async function fetchLumaEvent(eventUrl: string) {
  try {
    // Lu.ma's public API endpoint
    const apiUrl = `https://api.lu.ma/url?url=${encodeURIComponent(eventUrl)}`;

    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Lu.ma API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Lu.ma returns event data in a specific structure
    const event = data.event || data;
    if (!event || !event.name) {
      console.error("Lu.ma: No event data in response", data);
      return null;
    }

    // Transform to our expected format
    return {
      url: eventUrl,
      title: event.name,
      name: event.name,
      description: event.description || event.description_md,
      start: event.start_at,
      end: event.end_at,
      startDate: event.start_at,
      endDate: event.end_at,
      location: event.geo_address_info?.full_address || event.location_name,
      venue: event.location_name,
      address: event.geo_address_info?.full_address,
      city: event.geo_address_info?.city,
      latitude: event.geo_latitude,
      longitude: event.geo_longitude,
      organizer: event.hosts?.[0]?.name,
      hostName: event.hosts?.[0]?.name,
      imageUrl: event.cover_url,
      coverImage: event.cover_url,
      attendeeCount: event.guest_count,
      isFree: !event.ticket_info?.is_paid,
      price: event.ticket_info?.price_range,
    };
  } catch (error) {
    console.error("Lu.ma fetch error:", error);
    return null;
  }
}
