import { SupabaseClient } from "@supabase/supabase-js";
import type { EventbriteEvent } from "../types";
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

export async function processEventbriteEvents(
  supabase: SupabaseClient,
  events: EventbriteEvent[],
  createdBy?: string
): Promise<ProcessResult> {
  const result = createEmptyResult();

  for (const event of events) {
    try {
      const normalized = normalizeEventbriteEvent(event);

      if (!normalized.title || !normalized.startsAt) {
        result.skipped++;
        continue;
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

      // Download and re-upload image to our storage (external CDN URLs expire)
      const imageUrl = await downloadAndUploadImage(
        supabase,
        normalized.imageUrl,
        slug
      );

      // Detect platform from URL
      let platform = "eventbrite";
      if (event.url?.includes("meetup.com")) platform = "meetup";
      if (event.url?.includes("lu.ma")) platform = "luma";

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
        status: "published",
        timezone: "Asia/Ho_Chi_Minh",
        organizer_id: organizerId,
        created_by: createdBy,
        source_platform: platform,
        source_metadata: {
          is_free: event.is_free,
          price_display: event.ticket_availability?.minimum_ticket_price?.display,
          imported_at: new Date().toISOString(),
        },
      }).select("id").single();

      if (error) {
        result.errors++;
        result.details.push(`Error: ${normalized.title} - ${error.message}`);
      } else {
        result.processed++;

        // Trigger translation to all 12 languages (server-side, no HTTP)
        if (newEvent?.id) {
          const fieldsToTranslate = [];
          if (normalized.title) {
            fieldsToTranslate.push({ field_name: "title" as const, text: normalized.title });
          }
          if (normalized.description) {
            fieldsToTranslate.push({ field_name: "description" as const, text: normalized.description });
          }

          if (fieldsToTranslate.length > 0) {
            triggerTranslationServer("event", newEvent.id, fieldsToTranslate);
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

function normalizeEventbriteEvent(event: EventbriteEvent) {
  const latitude = event.venue?.address?.latitude;
  const longitude = event.venue?.address?.longitude;
  const locationName = event.venue?.name || event.location;

  return {
    title: event.name || event.title,
    description: event.description || event.summary,
    startsAt: event.start?.utc || event.start?.local || event.startTime,
    endsAt: event.end?.utc || event.end?.local || event.endTime || null,
    locationName,
    address: event.venue?.address?.localized_address_display,
    mapsUrl: generateMapsUrl(latitude, longitude, locationName),
    imageUrl: event.logo?.url || event.imageUrl || event.coverImage,
    organizerName: event.organizer?.name || event.hostName,
  };
}
