import { SupabaseClient } from "@supabase/supabase-js";
import {
  slugify,
  generateUniqueSlug,
  findOrCreateOrganizer,
  checkDuplicateByUrl,
  generateMapsUrl,
  createEmptyResult,
  downloadAndUploadImage,
  type ProcessResult,
} from "../utils";
import { triggerTranslationServer } from "@/lib/translations";

const WELLHOODS_API = "https://wellhoods.com/api/events";

/**
 * Wellhoods event structure from their API
 * Based on: https://wellhoods.com/api/events and https://wellhoods.com/api/events/{slug}
 */
export interface WellhoodsEvent {
  id: string;
  slug: string;
  title: string;
  description?: string | unknown; // Can be Slate.js JSON or string
  eventDate: string; // ISO date "2026-02-04T00:00:00.000Z"
  eventTime: string; // "09:30"
  eventEndDate?: string;
  eventEndTime?: string;
  location?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  imageUrl?: string; // API returns imageUrl, not image
  hostName?: string;
  hostId?: string;
  attendeeCount?: number;
  fee?: number; // API returns fee, not price
  currency?: string;
}

/**
 * Fetch all events from Wellhoods API
 */
export async function fetchWellhoodsEvents(): Promise<WellhoodsEvent[]> {
  try {
    const response = await fetch(WELLHOODS_API, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Wellhoods API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    // API returns { events: [...] } or just [...]
    const events = data.events || data;

    if (!Array.isArray(events)) {
      console.error("Wellhoods API: unexpected response format");
      return [];
    }

    console.log(`Wellhoods: Fetched ${events.length} events from API`);
    return events;
  } catch (error) {
    console.error("Wellhoods fetch error:", error);
    return [];
  }
}

/**
 * Fetch a single event with full details
 */
export async function fetchWellhoodsEvent(slug: string): Promise<WellhoodsEvent | null> {
  try {
    const response = await fetch(`${WELLHOODS_API}/${slug}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; DalatApp/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`Wellhoods API error for ${slug}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.event || data;
  } catch (error) {
    console.error(`Wellhoods fetch error for ${slug}:`, error);
    return null;
  }
}

/**
 * Process Wellhoods events and import them to dalat.app
 */
export async function processWellhoodsEvents(
  supabase: SupabaseClient,
  events: WellhoodsEvent[],
  createdBy?: string
): Promise<ProcessResult> {
  const result = createEmptyResult();

  for (const event of events) {
    try {
      const eventUrl = `https://wellhoods.com/events/${event.slug}`;
      const normalized = normalizeWellhoodsEvent(event);

      if (!normalized.title) {
        result.skipped++;
        result.details.push(`Skipped: Missing title - ${eventUrl}`);
        continue;
      }

      // Check for duplicates by URL
      if (await checkDuplicateByUrl(supabase, eventUrl)) {
        result.skipped++;
        result.details.push(`Skipped: Already exists - ${normalized.title}`);
        continue;
      }

      // Also check by title + date combo to avoid duplicates from other sources
      const { data: existingByTitle } = await supabase
        .from("events")
        .select("id")
        .ilike("title", normalized.title)
        .gte("starts_at", normalized.startsAt?.split("T")[0] || "")
        .lt("starts_at", getNextDay(normalized.startsAt))
        .limit(1)
        .single();

      if (existingByTitle) {
        result.skipped++;
        result.details.push(`Skipped: Similar event exists - ${normalized.title}`);
        continue;
      }

      const organizerId = await findOrCreateOrganizer(
        supabase,
        normalized.organizerName
      );
      const slug = await generateUniqueSlug(supabase, slugify(normalized.title));

      // Download and re-upload image to our storage
      const imageUrl = await downloadAndUploadImage(
        supabase,
        normalized.imageUrl,
        slug
      );

      const { data: newEvent, error } = await supabase
        .from("events")
        .insert({
          slug,
          title: normalized.title,
          description: normalized.description,
          starts_at: normalized.startsAt,
          ends_at: normalized.endsAt,
          location_name: normalized.locationName,
          address: normalized.address,
          google_maps_url: normalized.mapsUrl,
          external_chat_url: eventUrl,
          image_url: imageUrl,
          status: "published",
          timezone: "Asia/Ho_Chi_Minh",
          organizer_id: organizerId,
          created_by: createdBy,
          source_platform: "wellhoods",
          source_metadata: {
            wellhoods_id: event.id,
            category: event.category,
            attendee_count: event.attendeeCount,
            is_free: !event.fee || event.fee === 0,
            fee: event.fee,
            currency: event.currency,
            imported_at: new Date().toISOString(),
          },
        })
        .select("id")
        .single();

      if (error) {
        result.errors++;
        result.details.push(`Error: ${normalized.title} - ${error.message}`);
      } else {
        result.processed++;
        result.details.push(`Imported: ${normalized.title}`);

        // Trigger translation
        if (newEvent?.id) {
          const fieldsToTranslate = [];
          if (normalized.title) {
            fieldsToTranslate.push({ field_name: "title" as const, text: normalized.title });
          }
          if (normalized.description) {
            fieldsToTranslate.push({ field_name: "description" as const, text: normalized.description });
          }

          if (fieldsToTranslate.length > 0) {
            await triggerTranslationServer("event", newEvent.id, fieldsToTranslate);
          }
        }
      }
    } catch (err) {
      result.errors++;
      result.details.push(`Exception: ${event.slug} - ${err}`);
    }
  }

  return result;
}

/**
 * Parse Slate.js rich text JSON format into plain text
 */
function parseSlateDescription(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return extractTextFromNodes(content);
  }

  if (typeof content === "object" && content !== null) {
    return extractTextFromNodes([content]);
  }

  return "";
}

function extractTextFromNodes(nodes: unknown[]): string {
  const blocks: string[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;

    const nodeObj = node as Record<string, unknown>;

    if ("text" in nodeObj && typeof nodeObj.text === "string") {
      blocks.push(nodeObj.text);
      continue;
    }

    if ("children" in nodeObj && Array.isArray(nodeObj.children)) {
      const childText = extractTextFromNodes(nodeObj.children);
      if (childText) blocks.push(childText);
    }
  }

  return blocks.join("\n").trim();
}

function normalizeWellhoodsEvent(event: WellhoodsEvent) {
  // Parse dates
  let startsAt = event.eventDate;
  if (startsAt && event.eventTime) {
    const dateOnly = startsAt.split("T")[0];
    startsAt = `${dateOnly}T${event.eventTime}:00`;
  }

  let endsAt = event.eventEndDate || null;
  if (endsAt && event.eventEndTime) {
    const dateOnly = endsAt.split("T")[0];
    endsAt = `${dateOnly}T${event.eventEndTime}:00`;
  }

  // Parse description (may be Slate.js JSON)
  const description = parseSlateDescription(event.description);

  return {
    title: event.title,
    description,
    startsAt,
    endsAt,
    locationName: event.location,
    address: event.address,
    mapsUrl: generateMapsUrl(event.latitude, event.longitude, event.location, "Da Lat"),
    imageUrl: event.imageUrl,
    organizerName: event.hostName,
  };
}

function getNextDay(dateStr?: string | null): string {
  if (!dateStr) return "9999-12-31";
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}
