# Apify Multi-Platform Event Integration Plan

> **For AI Execution**: This document is designed for a fresh Claude Code session to execute using Ralph Loop, subagents, and parallel task execution.

## Executive Summary

Build an automated pipeline that receives scraped event data from multiple Apify scrapers (Facebook, Instagram, TikTok, Eventbrite) via webhooks and imports them into the dalat.app database.

---

## Pre-Execution Setup

### Start Ralph Loop

```
/ralph-loop "Execute the Apify Integration Plan in APIFY_INTEGRATION_PLAN.md. Work through each phase systematically. Use subagents for parallel work. Output <promise>APIFY INTEGRATION COMPLETE</promise> when all phases are done and tests pass." --completion-promise "APIFY INTEGRATION COMPLETE" --max-iterations 25
```

### Recommended Subagent Strategy

Use the Task tool with these agents in parallel where possible:
- `Explore` - For codebase exploration
- `code-architect` - For designing components
- `code-reviewer` - After each phase completion

---

## Phase 1: Webhook API Endpoint

### Goal
Create `/api/import/apify-webhook` that receives POST requests from Apify when scraping completes.

### Files to Create

#### 1.1 Create Webhook Route

**File**: `app/api/import/apify-webhook/route.ts`

```typescript
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { processApifyPayload } from "@/lib/import/apify-processor";

// Apify sends webhook with actor run results
export async function POST(request: Request) {
  try {
    // Verify webhook secret (set in Apify webhook config)
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.APIFY_WEBHOOK_SECRET;

    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();

    // Apify webhook payload structure
    const {
      actorId,
      actorRunId,
      datasetId,
      eventType,
      resource
    } = payload;

    // Only process successful runs
    if (eventType !== "ACTOR.RUN.SUCCEEDED") {
      return NextResponse.json({
        message: `Ignored event type: ${eventType}`
      });
    }

    // Fetch results from Apify dataset
    const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${process.env.APIFY_API_TOKEN}`;
    const datasetResponse = await fetch(datasetUrl);

    if (!datasetResponse.ok) {
      throw new Error(`Failed to fetch dataset: ${datasetResponse.statusText}`);
    }

    const items = await datasetResponse.json();

    // Process based on actor type
    const result = await processApifyPayload({
      actorId,
      actorRunId,
      items,
    });

    return NextResponse.json({
      success: true,
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });

  } catch (error) {
    console.error("Apify webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

#### 1.2 Create Apify Processor Library

**File**: `lib/import/apify-processor.ts`

```typescript
import { createClient } from "@supabase/supabase-js";
import { processFacebookEvents } from "./processors/facebook";
import { processInstagramPosts } from "./processors/instagram";
import { processTikTokPosts } from "./processors/tiktok";
import { processEventbritEvents } from "./processors/eventbrite";

// Known Apify actor IDs - update these with your actual actor IDs
const ACTOR_MAP: Record<string, string> = {
  // Facebook - use the detailed scraper
  "pratikdani/facebook-event-scraper": "facebook",
  "simpleapi/facebook-events-scraper": "facebook",
  // Instagram
  "apify/instagram-hashtag-scraper": "instagram",
  "apify/instagram-post-scraper": "instagram",
  // TikTok
  "clockworks/tiktok-hashtag-scraper": "tiktok",
  "apidojo/tiktok-location-scraper": "tiktok",
  // Eventbrite & Multi-platform
  "newpo/eventbrite-scraper": "eventbrite",
  "barrierefix/event-scraper-pro": "eventbrite", // handles multiple platforms
};

interface ProcessResult {
  processed: number;
  skipped: number;
  errors: number;
  details?: string[];
}

interface ApifyPayload {
  actorId: string;
  actorRunId: string;
  items: any[];
}

export async function processApifyPayload(payload: ApifyPayload): Promise<ProcessResult> {
  const { actorId, items } = payload;

  // Determine processor based on actor
  const platform = ACTOR_MAP[actorId] || detectPlatformFromData(items[0]);

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  switch (platform) {
    case "facebook":
      return processFacebookEvents(supabase, items);
    case "instagram":
      return processInstagramPosts(supabase, items);
    case "tiktok":
      return processTikTokPosts(supabase, items);
    case "eventbrite":
      return processEventbritEvents(supabase, items);
    default:
      console.warn(`Unknown platform for actor: ${actorId}`);
      return { processed: 0, skipped: items.length, errors: 0 };
  }
}

// Fallback detection based on data structure
function detectPlatformFromData(item: any): string | null {
  if (!item) return null;

  if (item.url?.includes("facebook.com")) return "facebook";
  if (item.url?.includes("instagram.com")) return "instagram";
  if (item.url?.includes("tiktok.com")) return "tiktok";
  if (item.url?.includes("eventbrite.com")) return "eventbrite";
  if (item.url?.includes("meetup.com")) return "eventbrite"; // same processor
  if (item.url?.includes("lu.ma")) return "eventbrite";

  return null;
}
```

#### 1.3 Create Facebook Processor (Enhanced)

**File**: `lib/import/processors/facebook.ts`

This replaces the logic in `scripts/import-facebook-events.ts` but optimized for webhook use.

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

interface FacebookEvent {
  // From pratikdani/facebook-event-scraper (detailed scraper)
  url: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  // Location
  location?: {
    name?: string;
    address?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  // Can also be flat (from some scrapers)
  "location.name"?: string;
  "location.address"?: string;
  "location.city"?: string;
  "location.latitude"?: number;
  "location.longitude"?: number;
  // Organizer
  organizer?: {
    name?: string;
    url?: string;
  };
  organizedBy?: string;
  // Media - detailed scraper gets multiple images
  coverPhoto?: string;
  imageUrl?: string;
  images?: string[];
  // Engagement
  goingCount?: number;
  interestedCount?: number;
  usersGoing?: number;
  usersInterested?: number;
  // Tickets
  ticketUrl?: string;
}

interface ProcessResult {
  processed: number;
  skipped: number;
  errors: number;
  details: string[];
}

export async function processFacebookEvents(
  supabase: SupabaseClient,
  events: FacebookEvent[]
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, skipped: 0, errors: 0, details: [] };

  for (const event of events) {
    try {
      // Normalize the event data (handle both flat and nested formats)
      const normalized = normalizeFacebookEvent(event);

      if (!normalized.title || !normalized.startsAt) {
        result.skipped++;
        result.details.push(`Skipped: missing title or date - ${event.url}`);
        continue;
      }

      // Check for duplicates by Facebook URL
      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("external_chat_url", event.url)
        .single();

      if (existing) {
        result.skipped++;
        continue;
      }

      // Find or create organizer
      const organizerId = await findOrCreateOrganizer(supabase, normalized.organizerName);

      // Generate unique slug
      const slug = await generateUniqueSlug(supabase, slugify(normalized.title));

      // Insert event
      const { error } = await supabase.from("events").insert({
        slug,
        title: normalized.title,
        description: normalized.description,
        starts_at: normalized.startsAt,
        ends_at: normalized.endsAt,
        location_name: normalized.locationName,
        address: normalized.address,
        google_maps_url: normalized.mapsUrl,
        external_chat_url: event.url,
        image_url: normalized.imageUrl,
        status: "published",
        timezone: "Asia/Ho_Chi_Minh",
        organizer_id: organizerId,
        source_platform: "facebook",
        source_metadata: {
          going_count: normalized.goingCount,
          interested_count: normalized.interestedCount,
          ticket_url: normalized.ticketUrl,
          additional_images: normalized.additionalImages,
          imported_at: new Date().toISOString(),
        },
      });

      if (error) {
        result.errors++;
        result.details.push(`Error: ${normalized.title} - ${error.message}`);
      } else {
        result.processed++;
      }
    } catch (err) {
      result.errors++;
      result.details.push(`Exception: ${event.url} - ${err}`);
    }
  }

  return result;
}

function normalizeFacebookEvent(event: FacebookEvent) {
  // Handle nested vs flat location
  const locationName = event.location?.name || event["location.name"];
  const locationCity = event.location?.city || event["location.city"];
  const latitude = event.location?.latitude || event["location.latitude"];
  const longitude = event.location?.longitude || event["location.longitude"];
  const address = event.location?.address || event["location.address"];

  // Handle nested vs flat organizer
  const organizerName = event.organizer?.name ||
    extractOrganizerName(event.organizedBy);

  // Handle various image formats
  const imageUrl = event.coverPhoto || event.imageUrl;
  const additionalImages = event.images?.filter(img => img !== imageUrl) || [];

  // Generate maps URL
  const mapsUrl = latitude && longitude
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : locationName
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [locationName, locationCity, "Vietnam"].filter(Boolean).join(", ")
      )}`
    : null;

  return {
    title: event.name,
    description: event.description || null,
    startsAt: event.startDate || event.utcStartDate,
    endsAt: event.endDate || event.utcEndDate || null,
    locationName: locationName || locationCity || null,
    address: address || null,
    mapsUrl,
    imageUrl: imageUrl || null,
    additionalImages,
    organizerName,
    goingCount: event.goingCount || event.usersGoing || 0,
    interestedCount: event.interestedCount || event.usersInterested || 0,
    ticketUrl: event.ticketUrl || null,
  };
}

function extractOrganizerName(organizedBy?: string): string | null {
  if (!organizedBy) return null;
  return organizedBy.replace(/^Event by\s*/i, "").split(" and ")[0].trim();
}

// Reuse utilities from existing script or inline them
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

async function generateUniqueSlug(supabase: SupabaseClient, baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const { data } = await supabase
      .from("events")
      .select("slug")
      .eq("slug", slug)
      .single();

    if (!data) return slug;

    slug = `${baseSlug}-${counter}`;
    counter++;

    if (counter > 100) {
      return `${baseSlug}-${Date.now()}`;
    }
  }
}

async function findOrCreateOrganizer(
  supabase: SupabaseClient,
  organizerName: string | null
): Promise<string | null> {
  if (!organizerName) return null;

  const slug = slugify(organizerName);

  // Check if exists
  const { data: existing } = await supabase
    .from("organizers")
    .select("id")
    .or(`slug.eq.${slug},name.eq.${organizerName}`)
    .single();

  if (existing) return existing.id;

  // Create new
  const { data: created, error } = await supabase
    .from("organizers")
    .insert({
      slug,
      name: organizerName,
      description: "Organizer imported from Facebook Events. Contact us to claim this profile!",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create organizer:", error);
    return null;
  }

  return created?.id || null;
}
```

#### 1.4 Create Instagram Processor

**File**: `lib/import/processors/instagram.ts`

Instagram posts need AI extraction to identify events from captions.

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

interface InstagramPost {
  url: string;
  shortCode?: string;
  caption?: string;
  displayUrl?: string;
  images?: string[];
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  locationName?: string;
  locationId?: string;
  likesCount?: number;
  commentsCount?: number;
  hashtags?: string[];
}

interface ExtractedEvent {
  isEvent: boolean;
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  location?: string;
  ticketInfo?: string;
}

export async function processInstagramPosts(
  supabase: SupabaseClient,
  posts: InstagramPost[]
): Promise<{ processed: number; skipped: number; errors: number; details: string[] }> {
  const result = { processed: 0, skipped: 0, errors: 0, details: [] as string[] };
  const client = new Anthropic();

  for (const post of posts) {
    try {
      // Skip posts without captions (can't extract event info)
      if (!post.caption) {
        result.skipped++;
        continue;
      }

      // Use AI to determine if this is an event and extract details
      const extracted = await extractEventFromCaption(client, post.caption);

      if (!extracted.isEvent || !extracted.title || !extracted.date) {
        result.skipped++;
        continue;
      }

      // Check for duplicates
      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("external_chat_url", post.url)
        .single();

      if (existing) {
        result.skipped++;
        continue;
      }

      // Parse date (AI returns ISO or human readable)
      const startsAt = parseEventDate(extracted.date, extracted.time);
      if (!startsAt) {
        result.skipped++;
        result.details.push(`Could not parse date: ${extracted.date}`);
        continue;
      }

      const slug = await generateUniqueSlug(supabase, slugify(extracted.title));

      const { error } = await supabase.from("events").insert({
        slug,
        title: extracted.title,
        description: extracted.description || post.caption,
        starts_at: startsAt,
        location_name: extracted.location || post.locationName,
        external_chat_url: post.url,
        image_url: post.displayUrl || post.images?.[0],
        status: "pending_review", // IG events need manual review
        timezone: "Asia/Ho_Chi_Minh",
        source_platform: "instagram",
        source_metadata: {
          owner_username: post.ownerUsername,
          hashtags: post.hashtags,
          likes_count: post.likesCount,
          extracted_by_ai: true,
          imported_at: new Date().toISOString(),
        },
      });

      if (error) {
        result.errors++;
        result.details.push(`Error: ${extracted.title} - ${error.message}`);
      } else {
        result.processed++;
      }
    } catch (err) {
      result.errors++;
    }
  }

  return result;
}

async function extractEventFromCaption(
  client: Anthropic,
  caption: string
): Promise<ExtractedEvent> {
  const response = await client.messages.create({
    model: "claude-haiku-4-20250514",
    max_tokens: 500,
    system: `You analyze Instagram captions to detect events in Đà Lạt, Vietnam.
Return JSON only, no markdown. Structure:
{
  "isEvent": boolean,
  "title": "event name if found",
  "description": "brief description",
  "date": "ISO date or 'January 15, 2026' format",
  "time": "start time if mentioned",
  "location": "venue name if mentioned",
  "ticketInfo": "ticket/price info if mentioned"
}

Only isEvent=true if this clearly promotes an upcoming event (concert, workshop, party, festival, etc).
Regular posts about past events or general content should be isEvent=false.`,
    messages: [{ role: "user", content: caption }],
  });

  const text = response.content[0];
  if (text.type !== "text") {
    return { isEvent: false };
  }

  try {
    return JSON.parse(text.text);
  } catch {
    return { isEvent: false };
  }
}

function parseEventDate(dateStr?: string, timeStr?: string): string | null {
  if (!dateStr) return null;

  try {
    // Try ISO format first
    const iso = new Date(dateStr);
    if (!isNaN(iso.getTime())) {
      return iso.toISOString();
    }

    // Try various formats
    const withTime = timeStr ? `${dateStr} ${timeStr}` : dateStr;
    const parsed = new Date(withTime);

    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  } catch {
    // Fall through
  }

  return null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

async function generateUniqueSlug(supabase: SupabaseClient, baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const { data } = await supabase
      .from("events")
      .select("slug")
      .eq("slug", slug)
      .single();

    if (!data) return slug;
    slug = `${baseSlug}-${counter}`;
    counter++;
    if (counter > 100) return `${baseSlug}-${Date.now()}`;
  }
}
```

#### 1.5 Create TikTok Processor

**File**: `lib/import/processors/tiktok.ts`

Similar to Instagram - uses AI to extract events from video descriptions.

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

interface TikTokPost {
  url?: string;
  webVideoUrl?: string;
  text?: string;
  description?: string;
  createTime?: number;
  createTimeISO?: string;
  authorMeta?: {
    name?: string;
    nickName?: string;
  };
  locationCreated?: string;
  videoMeta?: {
    coverUrl?: string;
  };
  covers?: string[];
  diggCount?: number;
  shareCount?: number;
  commentCount?: number;
  hashtags?: Array<{ name: string }>;
}

export async function processTikTokPosts(
  supabase: SupabaseClient,
  posts: TikTokPost[]
): Promise<{ processed: number; skipped: number; errors: number; details: string[] }> {
  const result = { processed: 0, skipped: 0, errors: 0, details: [] as string[] };
  const client = new Anthropic();

  for (const post of posts) {
    try {
      const caption = post.text || post.description;
      if (!caption) {
        result.skipped++;
        continue;
      }

      // Use AI to extract event info
      const extracted = await extractEventFromTikTok(client, caption);

      if (!extracted.isEvent || !extracted.title || !extracted.date) {
        result.skipped++;
        continue;
      }

      const postUrl = post.url || post.webVideoUrl;
      if (!postUrl) {
        result.skipped++;
        continue;
      }

      // Check for duplicates
      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("external_chat_url", postUrl)
        .single();

      if (existing) {
        result.skipped++;
        continue;
      }

      const startsAt = parseEventDate(extracted.date, extracted.time);
      if (!startsAt) {
        result.skipped++;
        continue;
      }

      const slug = await generateUniqueSlug(supabase, slugify(extracted.title));
      const coverImage = post.videoMeta?.coverUrl || post.covers?.[0];

      const { error } = await supabase.from("events").insert({
        slug,
        title: extracted.title,
        description: extracted.description || caption,
        starts_at: startsAt,
        location_name: extracted.location || post.locationCreated,
        external_chat_url: postUrl,
        image_url: coverImage,
        status: "pending_review",
        timezone: "Asia/Ho_Chi_Minh",
        source_platform: "tiktok",
        source_metadata: {
          author_name: post.authorMeta?.nickName || post.authorMeta?.name,
          hashtags: post.hashtags?.map(h => h.name),
          digg_count: post.diggCount,
          share_count: post.shareCount,
          extracted_by_ai: true,
          imported_at: new Date().toISOString(),
        },
      });

      if (error) {
        result.errors++;
      } else {
        result.processed++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}

async function extractEventFromTikTok(client: Anthropic, caption: string) {
  // Same logic as Instagram - reuse or abstract
  const response = await client.messages.create({
    model: "claude-haiku-4-20250514",
    max_tokens: 500,
    system: `You analyze TikTok captions to detect events in Đà Lạt, Vietnam.
Return JSON only: { "isEvent": boolean, "title": string, "description": string, "date": string, "time": string, "location": string }
Only isEvent=true for clear upcoming event promotions.`,
    messages: [{ role: "user", content: caption }],
  });

  const text = response.content[0];
  if (text.type !== "text") return { isEvent: false };

  try {
    return JSON.parse(text.text);
  } catch {
    return { isEvent: false };
  }
}

// Reuse utilities
function parseEventDate(dateStr?: string, timeStr?: string): string | null {
  if (!dateStr) return null;
  try {
    const iso = new Date(dateStr);
    if (!isNaN(iso.getTime())) return iso.toISOString();
    const parsed = new Date(timeStr ? `${dateStr} ${timeStr}` : dateStr);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  } catch {}
  return null;
}

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "").substring(0, 60);
}

async function generateUniqueSlug(supabase: SupabaseClient, baseSlug: string): Promise<string> {
  let slug = baseSlug, counter = 1;
  while (true) {
    const { data } = await supabase.from("events").select("slug").eq("slug", slug).single();
    if (!data) return slug;
    slug = `${baseSlug}-${counter++}`;
    if (counter > 100) return `${baseSlug}-${Date.now()}`;
  }
}
```

#### 1.6 Create Eventbrite Processor

**File**: `lib/import/processors/eventbrite.ts`

```typescript
import { SupabaseClient } from "@supabase/supabase-js";

interface EventbriteEvent {
  url: string;
  name: string;
  description?: string;
  summary?: string;
  start?: { local?: string; utc?: string };
  end?: { local?: string; utc?: string };
  venue?: {
    name?: string;
    address?: {
      localized_address_display?: string;
      city?: string;
      latitude?: string;
      longitude?: string;
    };
  };
  organizer?: {
    name?: string;
    url?: string;
  };
  logo?: { url?: string };
  imageUrl?: string;
  is_free?: boolean;
  ticket_availability?: {
    minimum_ticket_price?: { display?: string };
  };
  // Lu.ma and Meetup may have different structures
  title?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  coverImage?: string;
  hostName?: string;
}

export async function processEventbritEvents(
  supabase: SupabaseClient,
  events: EventbriteEvent[]
): Promise<{ processed: number; skipped: number; errors: number; details: string[] }> {
  const result = { processed: 0, skipped: 0, errors: 0, details: [] as string[] };

  for (const event of events) {
    try {
      // Normalize across Eventbrite/Meetup/Lu.ma formats
      const normalized = normalizeEventbriteEvent(event);

      if (!normalized.title || !normalized.startsAt) {
        result.skipped++;
        continue;
      }

      // Check duplicates
      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("external_chat_url", event.url)
        .single();

      if (existing) {
        result.skipped++;
        continue;
      }

      const organizerId = await findOrCreateOrganizer(supabase, normalized.organizerName);
      const slug = await generateUniqueSlug(supabase, slugify(normalized.title));

      // Detect platform from URL
      let platform = "eventbrite";
      if (event.url?.includes("meetup.com")) platform = "meetup";
      if (event.url?.includes("lu.ma")) platform = "luma";

      const { error } = await supabase.from("events").insert({
        slug,
        title: normalized.title,
        description: normalized.description,
        starts_at: normalized.startsAt,
        ends_at: normalized.endsAt,
        location_name: normalized.locationName,
        address: normalized.address,
        google_maps_url: normalized.mapsUrl,
        external_chat_url: event.url,
        image_url: normalized.imageUrl,
        status: "published",
        timezone: "Asia/Ho_Chi_Minh",
        organizer_id: organizerId,
        source_platform: platform,
        source_metadata: {
          is_free: event.is_free,
          price_display: event.ticket_availability?.minimum_ticket_price?.display,
          imported_at: new Date().toISOString(),
        },
      });

      if (error) {
        result.errors++;
        result.details.push(`Error: ${normalized.title} - ${error.message}`);
      } else {
        result.processed++;
      }
    } catch (err) {
      result.errors++;
    }
  }

  return result;
}

function normalizeEventbriteEvent(event: EventbriteEvent) {
  return {
    title: event.name || event.title,
    description: event.description || event.summary,
    startsAt: event.start?.utc || event.start?.local || event.startTime,
    endsAt: event.end?.utc || event.end?.local || event.endTime || null,
    locationName: event.venue?.name || event.location,
    address: event.venue?.address?.localized_address_display,
    mapsUrl: event.venue?.address?.latitude && event.venue?.address?.longitude
      ? `https://www.google.com/maps?q=${event.venue.address.latitude},${event.venue.address.longitude}`
      : event.venue?.name
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue.name + ", Vietnam")}`
      : null,
    imageUrl: event.logo?.url || event.imageUrl || event.coverImage,
    organizerName: event.organizer?.name || event.hostName,
  };
}

// Utilities (same as facebook processor)
function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "").substring(0, 60);
}

async function generateUniqueSlug(supabase: SupabaseClient, baseSlug: string): Promise<string> {
  let slug = baseSlug, counter = 1;
  while (true) {
    const { data } = await supabase.from("events").select("slug").eq("slug", slug).single();
    if (!data) return slug;
    slug = `${baseSlug}-${counter++}`;
    if (counter > 100) return `${baseSlug}-${Date.now()}`;
  }
}

async function findOrCreateOrganizer(supabase: SupabaseClient, name: string | null | undefined): Promise<string | null> {
  if (!name) return null;
  const slug = slugify(name);

  const { data: existing } = await supabase
    .from("organizers")
    .select("id")
    .or(`slug.eq.${slug},name.eq.${name}`)
    .single();

  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("organizers")
    .insert({ slug, name, description: "Organizer imported from event platform." })
    .select("id")
    .single();

  return created?.id || null;
}
```

---

## Phase 2: Database Migration

### Goal
Add `source_platform` and `source_metadata` columns to events table.

### Migration File

**File**: `supabase/migrations/20260117_001_event_source_tracking.sql`

```sql
-- Add source tracking columns to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS source_platform TEXT,
ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}';

-- Add index for querying by platform
CREATE INDEX IF NOT EXISTS idx_events_source_platform ON events(source_platform);

-- Add comment
COMMENT ON COLUMN events.source_platform IS 'Platform the event was imported from: facebook, instagram, tiktok, eventbrite, meetup, luma, manual';
COMMENT ON COLUMN events.source_metadata IS 'Platform-specific metadata like engagement counts, original IDs, etc';
```

---

## Phase 3: Environment Configuration

### Required Environment Variables

Add to `.env.local`:

```bash
# Apify Integration
APIFY_API_TOKEN=your_apify_api_token_here
APIFY_WEBHOOK_SECRET=generate_a_random_secret_here

# Already present (verify these exist)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
```

Generate webhook secret:
```bash
openssl rand -hex 32
```

---

## Phase 4: Apify Actor Configuration

### 4.1 Switch to Better Facebook Scraper

Go to Apify and configure:

**Actor**: `pratikdani/facebook-event-scraper` (or `simpleapi/facebook-events-scraper`)

**Input Configuration**:
```json
{
  "startUrls": [
    "https://www.facebook.com/events/search?q=Da%20Lat"
  ],
  "maxEvents": 100,
  "proxy": {
    "useApifyProxy": true
  }
}
```

### 4.2 Configure Webhook

In Apify Console:
1. Go to your Actor → Integrations → Webhooks
2. Add webhook:
   - **Event types**: `ACTOR.RUN.SUCCEEDED`
   - **Request URL**: `https://dalat.app/api/import/apify-webhook`
   - **Headers**:
     ```
     Authorization: Bearer YOUR_WEBHOOK_SECRET
     Content-Type: application/json
     ```

### 4.3 Schedule Scrapers

Set up schedules for each actor:

| Actor | Schedule | Query |
|-------|----------|-------|
| Facebook Events | Daily 6 AM | "Đà Lạt" |
| Instagram Hashtag | Daily 7 AM | #dalat, #dalatevents |
| TikTok Location | Weekly Sunday | Đà Lạt, Vietnam |
| Event Scraper Pro | Daily 8 AM | Vietnam filter |

---

## Phase 5: Testing

### 5.1 Create Test Script

**File**: `scripts/test-apify-webhook.ts`

```typescript
/**
 * Test the Apify webhook endpoint locally
 * Usage: bun run scripts/test-apify-webhook.ts
 */

const testPayload = {
  actorId: "pratikdani/facebook-event-scraper",
  actorRunId: "test-run-123",
  datasetId: "test-dataset",
  eventType: "ACTOR.RUN.SUCCEEDED",
  resource: {},
};

// Mock some Facebook events
const mockEvents = [
  {
    url: "https://www.facebook.com/events/123456789/",
    name: "Test Concert in Đà Lạt",
    description: "A wonderful test concert featuring local artists.",
    startDate: "2026-02-15T19:00:00.000Z",
    location: {
      name: "Phố Bên Đồi",
      city: "Đà Lạt, Vietnam",
      latitude: 11.9404,
      longitude: 108.4583,
    },
    coverPhoto: "https://example.com/image.jpg",
    organizer: {
      name: "Test Organizer",
    },
    goingCount: 50,
    interestedCount: 200,
  },
];

async function test() {
  console.log("Testing Apify webhook endpoint...\n");

  // For local testing, we'll call the processor directly
  const { processApifyPayload } = await import("../lib/import/apify-processor");

  const result = await processApifyPayload({
    actorId: testPayload.actorId,
    actorRunId: testPayload.actorRunId,
    items: mockEvents,
  });

  console.log("Result:", JSON.stringify(result, null, 2));
}

test().catch(console.error);
```

### 5.2 Integration Test

**File**: `scripts/test-apify-integration.ts`

```typescript
/**
 * Full integration test - calls the actual webhook endpoint
 * Usage: bun run scripts/test-apify-integration.ts
 */

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/api/import/apify-webhook";
const WEBHOOK_SECRET = process.env.APIFY_WEBHOOK_SECRET;

async function testWebhook() {
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({
      actorId: "pratikdani/facebook-event-scraper",
      actorRunId: "integration-test",
      datasetId: "mock-dataset",
      eventType: "ACTOR.RUN.SUCCEEDED",
    }),
  });

  console.log("Status:", response.status);
  console.log("Response:", await response.json());
}

testWebhook().catch(console.error);
```

---

## Phase 6: Admin Dashboard (Optional)

### Import Status Page

**File**: `app/[locale]/admin/imports/page.tsx`

Basic admin page to view import history and status. Implementation details:
- Query events by `source_platform`
- Show counts per platform
- Show recent imports with status
- Allow manual re-import trigger

---

## Execution Checklist

Use this checklist to track progress:

- [ ] **Phase 1**: Create webhook API endpoint
  - [ ] `app/api/import/apify-webhook/route.ts`
  - [ ] `lib/import/apify-processor.ts`
  - [ ] `lib/import/processors/facebook.ts`
  - [ ] `lib/import/processors/instagram.ts`
  - [ ] `lib/import/processors/tiktok.ts`
  - [ ] `lib/import/processors/eventbrite.ts`

- [ ] **Phase 2**: Database migration
  - [ ] Create migration file
  - [ ] Run migration locally
  - [ ] Verify columns exist

- [ ] **Phase 3**: Environment setup
  - [ ] Add APIFY_API_TOKEN
  - [ ] Add APIFY_WEBHOOK_SECRET
  - [ ] Verify existing env vars

- [ ] **Phase 4**: Apify configuration
  - [ ] Document actor IDs to use
  - [ ] Document webhook setup steps

- [ ] **Phase 5**: Testing
  - [ ] Create test scripts
  - [ ] Run unit tests
  - [ ] Run integration test

- [ ] **Final**: Code review and cleanup
  - [ ] Run `bun run lint`
  - [ ] Run `bun run build`
  - [ ] All tests pass

---

## Completion Promise

When all phases are complete and tests pass, output:

```
<promise>APIFY INTEGRATION COMPLETE</promise>
```

---

## Notes for Execution

1. **Use subagents in parallel** for creating processor files (they're independent)
2. **Run code-reviewer agent** after each phase
3. **Test incrementally** - don't wait until the end
4. **Check existing patterns** in `app/api/` for consistent error handling
5. **The existing `scripts/import-facebook-events.ts`** has proven logic - reuse concepts

## Reference Files

- Existing import script: `scripts/import-facebook-events.ts`
- API pattern example: `app/api/enhance-text/route.ts`
- Types: `lib/types/index.ts`
- Supabase client pattern: `lib/supabase/server.ts`
