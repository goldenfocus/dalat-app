import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processFacebookEvents } from "@/lib/import/processors/facebook";
import { processEventbriteEvents } from "@/lib/import/processors/eventbrite";

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
    } else if (url.includes("lu.ma")) {
      platform = "luma";
      actorId = "newpo~eventbrite-scraper"; // Uses same scraper
    } else {
      return NextResponse.json(
        { error: "Unsupported URL. Supported: facebook.com, eventbrite.com, lu.ma" },
        { status: 400 }
      );
    }

    // Check Apify config
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        { error: "Apify not configured" },
        { status: 503 }
      );
    }

    console.log(`URL Import: Starting ${platform} scrape for ${url}`);

    // Call Apify synchronously - wait for result
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`;

    const runResponse = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url }],
        maxRequestsPerCrawl: 1,
      }),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error(`URL Import: Apify error - ${runResponse.status}`, errorText);
      return NextResponse.json(
        { error: `Failed to scrape URL (${runResponse.status})` },
        { status: 502 }
      );
    }

    const items = await runResponse.json();

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No event data found at URL" },
        { status: 404 }
      );
    }

    console.log(`URL Import: Got ${items.length} items from Apify`);

    // Process the scraped event
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let result;
    if (platform === "facebook") {
      result = await processFacebookEvents(supabase, items);
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
