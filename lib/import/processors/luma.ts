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
import { triggerTranslation } from "@/lib/translations-client";

// Lu.ma event from lexis-solutions/lu-ma-scraper
export interface LumaEvent {
  url: string;
  title?: string;
  name?: string;
  description?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  start?: string;
  end?: string;
  location?: string;
  venue?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  organizer?: string;
  hostName?: string;
  hostUrl?: string;
  imageUrl?: string;
  coverImage?: string;
  coverUrl?: string;
  attendeeCount?: number;
  category?: string;
  isFree?: boolean;
  price?: string;
}

export async function processLumaEvents(
  supabase: SupabaseClient,
  events: LumaEvent[],
  createdBy?: string,
  platform: string = "luma"
): Promise<ProcessResult> {
  const result = createEmptyResult();

  for (const event of events) {
    try {
      const normalized = normalizeLumaEvent(event);

      if (!normalized.title) {
        result.skipped++;
        result.details.push(`Skipped: Missing title - ${event.url}`);
        continue;
      }

      // For platforms without dates (e.g., OpenGraph-only scraping), create as draft
      const needsManualDate = !normalized.startsAt;
      if (needsManualDate) {
        // Set a placeholder date (tomorrow) so the event can be created
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(19, 0, 0, 0); // Default to 7 PM
        normalized.startsAt = tomorrow.toISOString();
      }

      // Check for duplicates
      if (await checkDuplicateByUrl(supabase, event.url)) {
        result.skipped++;
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

      const { data: newEvent, error } = await supabase.from("events").insert({
        slug,
        title: normalized.title,
        description: normalized.description,
        starts_at: normalized.startsAt,
        ends_at: normalized.endsAt,
        location_name: normalized.locationName,
        address: normalized.address,
        google_maps_url: normalized.mapsUrl,
        external_chat_url: event.url,
        image_url: imageUrl,
        status: needsManualDate ? "draft" : "published",
        timezone: "Asia/Ho_Chi_Minh",
        organizer_id: organizerId,
        created_by: createdBy,
        source_platform: platform,
        source_metadata: {
          attendee_count: event.attendeeCount,
          category: event.category,
          is_free: event.isFree,
          price: event.price,
          imported_at: new Date().toISOString(),
        },
      }).select("id").single();

      if (error) {
        result.errors++;
        result.details.push(`Error: ${normalized.title} - ${error.message}`);
      } else {
        result.processed++;

        // Trigger translation to all 12 languages
        if (newEvent?.id) {
          const fieldsToTranslate = [];
          if (normalized.title) {
            fieldsToTranslate.push({ field_name: "title" as const, text: normalized.title });
          }
          if (normalized.description) {
            fieldsToTranslate.push({ field_name: "description" as const, text: normalized.description });
          }

          if (fieldsToTranslate.length > 0) {
            triggerTranslation("event", newEvent.id, fieldsToTranslate);
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

function normalizeLumaEvent(event: LumaEvent) {
  const locationName = event.venue || event.location;

  // Parse dates - Lu.ma scraper returns various formats
  let startsAt = event.start || event.startDate;
  if (startsAt && event.startTime && !startsAt.includes("T")) {
    startsAt = `${startsAt}T${event.startTime}`;
  }

  let endsAt = event.end || event.endDate || null;
  if (endsAt && event.endTime && !endsAt.includes("T")) {
    endsAt = `${endsAt}T${event.endTime}`;
  }

  return {
    title: event.title || event.name,
    description: event.description,
    startsAt,
    endsAt,
    locationName,
    address: event.address || (event.city ? `${locationName}, ${event.city}` : null),
    mapsUrl: generateMapsUrl(event.latitude, event.longitude, locationName),
    imageUrl: event.imageUrl || event.coverImage || event.coverUrl,
    organizerName: event.organizer || event.hostName,
  };
}
