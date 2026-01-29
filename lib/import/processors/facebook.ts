import { SupabaseClient } from "@supabase/supabase-js";
import type { FacebookEvent } from "../types";
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

export async function processFacebookEvents(
  supabase: SupabaseClient,
  events: FacebookEvent[],
  createdBy?: string
): Promise<ProcessResult> {
  const result = createEmptyResult();

  for (const event of events) {
    try {
      const normalized = normalizeFacebookEvent(event);

      if (!normalized.title || !normalized.startsAt) {
        result.skipped++;
        result.details.push(`Skipped: missing title or date - ${event.url}`);
        continue;
      }

      // Check for duplicates
      if (await checkDuplicateByUrl(supabase, event.url)) {
        result.skipped++;
        continue;
      }

      // Find or create organizer
      const organizerId = await findOrCreateOrganizer(
        supabase,
        normalized.organizerName
      );

      // Generate unique slug
      const slug = await generateUniqueSlug(supabase, slugify(normalized.title));

      // Download and re-upload image to our storage (external CDN URLs expire)
      const imageUrl = await downloadAndUploadImage(
        supabase,
        normalized.imageUrl,
        slug
      );

      // Insert event
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
        source_platform: "facebook",
        source_metadata: {
          going_count: normalized.goingCount,
          interested_count: normalized.interestedCount,
          ticket_url: normalized.ticketUrl,
          additional_images: normalized.additionalImages,
          imported_at: new Date().toISOString(),
        },
      }).select("id").single();

      if (error) {
        result.errors++;
        result.details.push(`Error: ${normalized.title} - ${error.message}`);
      } else {
        result.processed++;

        // Trigger translation to all 12 languages (server-side, no HTTP)
        // Must await to ensure translation completes before serverless function terminates
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
  const organizerName =
    event.organizer?.name || extractOrganizerName(event.organizedBy);

  // Handle various image formats
  const imageUrl = event.coverPhoto || event.imageUrl;
  const additionalImages =
    event.images?.filter((img) => img !== imageUrl) || [];

  // Generate maps URL
  const mapsUrl = generateMapsUrl(latitude, longitude, locationName, locationCity);

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
