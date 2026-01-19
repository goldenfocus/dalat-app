# Apify Integration Handover Document

> **For Fresh Claude Session**: Execute this with Ralph Loop for autonomous completion.

```
/ralph-loop "Complete the Apify integration per APIFY_HANDOVER.md. Build the venue discovery script, admin import page, and configure automated scraping. Output <promise>APIFY AUTOMATION COMPLETE</promise> when done." --completion-promise "APIFY AUTOMATION COMPLETE" --max-iterations 20
```

---

## Current State

### ✅ What's Done

1. **Webhook API** - `/api/import/apify-webhook` receives Apify data
2. **Processors** - Facebook, Instagram, TikTok, Eventbrite processors in `lib/import/processors/`
3. **Database** - `source_platform` and `source_metadata` columns added to events table
4. **Environment** - `APIFY_API_TOKEN` and `APIFY_WEBHOOK_SECRET` configured in Vercel
5. **Apify Webhook** - Configured on `pratikdani/facebook-event-scraper` actor

### ❌ What's NOT Working

The Facebook Event Scraper only scrapes **individual event URLs** you give it - it does NOT search for events by location. User has to manually find and paste URLs, which defeats the purpose.

### 🎯 What Needs to Be Built

1. **Venue Discovery Script** - Find Đà Lạt venues via Google Maps, extract Facebook page URLs
2. **Admin Import Page** - One-click import from pasted Facebook event URL
3. **Automated Venue Scraping** - Daily scrape of venue Facebook pages for new events

---

## Task 1: Venue Discovery Script

Create a script that finds Đà Lạt venues and extracts their Facebook pages.

### File: `scripts/discover-dalat-venues.ts`

```typescript
#!/usr/bin/env bun
/**
 * Discover Đà Lạt venues using Google Places API
 * Extracts Facebook page URLs for automated event scraping
 *
 * Usage: bun run scripts/discover-dalat-venues.ts
 *
 * Requires: GOOGLE_PLACES_API_KEY in .env.local
 */

interface Venue {
  name: string;
  placeId: string;
  address: string;
  types: string[];
  rating?: number;
  website?: string;
  facebookUrl?: string;
}

const DALAT_CENTER = { lat: 11.9404, lng: 108.4583 };
const SEARCH_RADIUS = 10000; // 10km

// Venue types likely to host events
const VENUE_TYPES = [
  "bar",
  "cafe",
  "night_club",
  "restaurant",
  "art_gallery",
  "museum",
  "tourist_attraction",
  "event_venue",
];

async function discoverVenues(): Promise<Venue[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("Missing GOOGLE_PLACES_API_KEY");
    process.exit(1);
  }

  const venues: Venue[] = [];

  for (const type of VENUE_TYPES) {
    console.log(`Searching for ${type}s...`);

    const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    url.searchParams.set("location", `${DALAT_CENTER.lat},${DALAT_CENTER.lng}`);
    url.searchParams.set("radius", String(SEARCH_RADIUS));
    url.searchParams.set("type", type);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url);
    const data = await response.json();

    if (data.results) {
      for (const place of data.results) {
        // Get place details for website/social links
        const details = await getPlaceDetails(apiKey, place.place_id);

        venues.push({
          name: place.name,
          placeId: place.place_id,
          address: place.vicinity,
          types: place.types,
          rating: place.rating,
          website: details?.website,
          facebookUrl: extractFacebookUrl(details?.website, place.name),
        });
      }
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  return venues;
}

async function getPlaceDetails(apiKey: string, placeId: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "website,url,formatted_phone_number");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const data = await response.json();
  return data.result;
}

function extractFacebookUrl(website?: string, name?: string): string | undefined {
  if (website?.includes("facebook.com")) {
    return website;
  }
  // Could also search Facebook for the venue name
  return undefined;
}

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║      Đà Lạt Venue Discovery Script         ║");
  console.log("╚════════════════════════════════════════════╝\n");

  const venues = await discoverVenues();

  // Deduplicate by placeId
  const unique = [...new Map(venues.map(v => [v.placeId, v])).values()];

  console.log(`\nFound ${unique.length} unique venues\n`);

  // Output venues with Facebook URLs
  const withFacebook = unique.filter(v => v.facebookUrl);
  console.log(`Venues with Facebook pages: ${withFacebook.length}`);

  withFacebook.forEach(v => {
    console.log(`  - ${v.name}: ${v.facebookUrl}`);
  });

  // Save to JSON for use with Apify
  const outputPath = "./data/dalat-venues.json";
  await Bun.write(outputPath, JSON.stringify(unique, null, 2));
  console.log(`\nSaved to ${outputPath}`);
}

main().catch(console.error);
```

### Alternative: Use Apify Google Maps Scraper

Instead of Google Places API (which costs money), use `compass/crawler-google-places` on Apify:

1. Go to: https://apify.com/compass/crawler-google-places
2. Input: Search "bars Đà Lạt", "cafes Đà Lạt", "event venues Đà Lạt"
3. Output: List of venues with websites
4. Post-process to extract Facebook URLs

---

## Task 2: Admin Import Page

Create a simple admin page for one-click event imports.

### File: `app/[locale]/admin/import/page.tsx`

```tsx
import { AdminImportPage } from "./admin-import-page";

export default function Page() {
  return <AdminImportPage />;
}
```

### File: `app/[locale]/admin/import/admin-import-page.tsx`

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function AdminImportPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    eventSlug?: string;
  } | null>(null);

  async function handleImport() {
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: `Imported: ${data.title}`,
          eventSlug: data.slug,
        });
        setUrl("");
      } else {
        setResult({
          success: false,
          message: data.error || "Import failed",
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: "Network error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Import Event</CardTitle>
          <CardDescription>
            Paste a Facebook event URL to import it instantly
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://facebook.com/events/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleImport()}
            />
            <Button onClick={handleImport} disabled={loading || !url.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import"}
            </Button>
          </div>

          {result && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              result.success ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
            }`}>
              {result.success ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>{result.message}</span>
              {result.eventSlug && (
                <a
                  href={`/events/${result.eventSlug}`}
                  className="ml-auto underline"
                  target="_blank"
                >
                  View →
                </a>
              )}
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">Supported URLs:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Facebook Events: facebook.com/events/...</li>
              <li>Eventbrite: eventbrite.com/e/...</li>
              <li>Lu.ma: lu.ma/...</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### File: `app/api/import/url/route.ts`

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processFacebookEvents } from "@/lib/import/processors/facebook";
import { processEventbriteEvents } from "@/lib/import/processors/eventbrite";

/**
 * Import a single event from a URL
 * Uses Apify to scrape the event, then processes it
 */
export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    // Determine platform
    let platform: string;
    if (url.includes("facebook.com")) {
      platform = "facebook";
    } else if (url.includes("eventbrite.com")) {
      platform = "eventbrite";
    } else if (url.includes("lu.ma")) {
      platform = "luma";
    } else {
      return NextResponse.json({ error: "Unsupported URL" }, { status: 400 });
    }

    // Call Apify to scrape the single URL
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json({ error: "Apify not configured" }, { status: 503 });
    }

    // Use the appropriate actor
    const actorId = platform === "facebook"
      ? "pratikdani~facebook-event-scraper"
      : "apify~web-scraper";

    // Start actor run synchronously (wait for result)
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url }],
          maxRequestsPerCrawl: 1,
        }),
      }
    );

    if (!runResponse.ok) {
      return NextResponse.json(
        { error: "Failed to scrape URL" },
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

    if (result.processed > 0) {
      // Get the created event
      const { data: event } = await supabase
        .from("events")
        .select("slug, title")
        .eq("external_chat_url", url)
        .single();

      return NextResponse.json({
        success: true,
        title: event?.title || items[0].name,
        slug: event?.slug,
      });
    } else if (result.skipped > 0) {
      return NextResponse.json(
        { error: "Event already exists or missing required data" },
        { status: 409 }
      );
    } else {
      return NextResponse.json(
        { error: "Failed to process event" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

---

## Task 3: Automated Venue Scraping

### Option A: Apify Saved Task

1. Create a file `data/dalat-venue-urls.json` with known venue Facebook page URLs
2. Set up an Apify Task that scrapes events from those pages daily

### Option B: Build Custom Scraper

Since Facebook page event scraping is tricky, consider:

1. **Eventbrite approach**: Eventbrite has location search - use `apify/eventbrite-scraper` with "Đà Lạt" query
2. **Google Events approach**: Use `apify/google-search-scraper` to search "events in Đà Lạt this week"

---

## Environment Variables Needed

```bash
# Already configured
APIFY_API_TOKEN=xxx
APIFY_WEBHOOK_SECRET=xxx
SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# May need to add
GOOGLE_PLACES_API_KEY=xxx  # For venue discovery (optional)
```

---

## Files Reference

### Existing Implementation
- `app/api/import/apify-webhook/route.ts` - Webhook endpoint ✅
- `lib/import/apify-processor.ts` - Main processor ✅
- `lib/import/processors/facebook.ts` - Facebook processor ✅
- `lib/import/processors/instagram.ts` - Instagram processor ✅
- `lib/import/processors/tiktok.ts` - TikTok processor ✅
- `lib/import/processors/eventbrite.ts` - Eventbrite processor ✅
- `lib/import/utils.ts` - Shared utilities ✅
- `lib/import/types.ts` - TypeScript types ✅

### To Create
- `app/[locale]/admin/import/page.tsx` - Admin import page
- `app/[locale]/admin/import/admin-import-page.tsx` - Client component
- `app/api/import/url/route.ts` - Single URL import API
- `scripts/discover-dalat-venues.ts` - Venue discovery script
- `data/dalat-venue-urls.json` - Known venue URLs

---

## Completion Checklist

- [ ] Create admin import page at `/admin/import`
- [ ] Create `/api/import/url` endpoint for single-URL imports
- [ ] Test single-URL import with a real Facebook event
- [ ] Create venue discovery script (Google Places or Apify)
- [ ] Compile list of Đà Lạt venue Facebook URLs
- [ ] Set up Apify saved task with venue URLs
- [ ] Configure daily schedule for automated scraping
- [ ] Verify webhook fires and events appear in database
- [ ] Run `bun run lint` and `bun run build`

---

## Completion Promise

When all tasks complete and tests pass:

```
<promise>APIFY AUTOMATION COMPLETE</promise>
```
