import { SupabaseClient } from "@supabase/supabase-js";
import { fromZonedTime } from "date-fns-tz";
import {
  slugify,
  generateUniqueSlug,
  findOrCreateOrganizer,
  generateMapsUrl,
  downloadAndUploadImage,
  type ProcessResult,
} from "./utils";
import { IMPORT_STATUS, MAX_IMPORTS_PER_RUN } from "./import-config";

/**
 * Event extracted from an article by AI.
 */
export interface ExtractedEvent {
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  startTime?: string; // HH:MM
  locationName?: string;
  address?: string;
  organizerName?: string;
  imageUrl?: string;
}

/**
 * Minimal article context needed to import its extracted events.
 */
export interface ImportableArticle {
  url: string;
  title: string;
  publishDate?: string;
  imageUrls: string[];
}

export interface ImportedEvent {
  id: string;
  title: string;
  description: string;
}

export interface ImportOptions {
  createdBy?: string;
  /** Override the draft gate — canary events must always stay drafts. */
  status?: "draft" | "published";
  sourcePlatform?: string;
}

/**
 * Insert AI-extracted events for one article: dedupe, organizer, slug,
 * Đà Lạt-local timestamps, cover image, row insert. Mutates `result` and
 * returns the successfully inserted events so the CALLER decides how to
 * translate (Vercel path uses the translate API; the Mac mini worker
 * generates translations itself via claude -p).
 *
 * Deliberately Next-free: imported by both server routes and the
 * standalone import worker (scripts/import-worker/worker.ts under tsx).
 */
export async function importExtractedEvents(
  supabase: SupabaseClient,
  article: ImportableArticle,
  events: ExtractedEvent[],
  result: ProcessResult,
  opts: ImportOptions = {}
): Promise<ImportedEvent[]> {
  const imported: ImportedEvent[] = [];

  for (const event of events) {
    try {
      if (result.processed >= MAX_IMPORTS_PER_RUN) {
        result.skipped++;
        result.details.push(
          `Cap reached (${MAX_IMPORTS_PER_RUN}) — skipped: ${event.title}`
        );
        continue;
      }

      // Check for duplicates by title + date
      const eventDate = event.startDate;
      const { data: existingByTitle } = await supabase
        .from("events")
        .select("id")
        .ilike("title", event.title)
        .gte("starts_at", eventDate)
        .lt("starts_at", getNextDay(eventDate))
        .limit(1)
        .single();

      if (existingByTitle) {
        result.skipped++;
        result.details.push(`Skipped: Similar event exists - ${event.title}`);
        continue;
      }

      const organizerId = await findOrCreateOrganizer(
        supabase,
        event.organizerName || "Sở Văn hóa, Thể thao và Du lịch Lâm Đồng"
      );
      const slug = await generateUniqueSlug(supabase, slugify(event.title));

      // Build starts_at timestamp — extracted times are Đà Lạt local time,
      // so convert explicitly (a bare string would be stored as UTC, 7h off)
      const localStart = event.startTime
        ? `${event.startDate}T${event.startTime}:00`
        : `${event.startDate}T09:00:00`; // Default to 9 AM
      const startsAt = fromZonedTime(localStart, "Asia/Ho_Chi_Minh").toISOString();

      // Build ends_at if available
      let endsAt: string | null = null;
      if (event.endDate) {
        endsAt = fromZonedTime(`${event.endDate}T22:00:00`, "Asia/Ho_Chi_Minh").toISOString(); // Default end time
      }

      // Try to download first image from article
      const imageUrl = await downloadAndUploadImage(
        article.imageUrls[0] || null,
        slug
      );

      const { data: newEvent, error } = await supabase
        .from("events")
        .insert({
          slug,
          title: event.title,
          description: event.description,
          starts_at: startsAt,
          ends_at: endsAt,
          location_name: event.locationName || "Đà Lạt",
          address: event.address,
          google_maps_url: generateMapsUrl(
            undefined,
            undefined,
            event.locationName,
            "Đà Lạt"
          ),
          external_chat_url: article.url, // Link back to source article
          image_url: imageUrl,
          status: opts.status ?? IMPORT_STATUS,
          timezone: "Asia/Ho_Chi_Minh",
          organizer_id: organizerId,
          created_by: opts.createdBy,
          source_platform: opts.sourcePlatform ?? "dalat-gov",
          source_metadata: {
            article_url: article.url,
            article_title: article.title,
            publish_date: article.publishDate,
            imported_at: new Date().toISOString(),
          },
        })
        .select("id")
        .single();

      if (error) {
        result.errors++;
        result.details.push(`Error: ${event.title} - ${error.message}`);
      } else {
        result.processed++;
        result.details.push(`Imported: ${event.title}`);
        if (newEvent?.id) {
          imported.push({
            id: newEvent.id,
            title: event.title,
            description: event.description,
          });
        }
      }
    } catch (err) {
      result.errors++;
      result.details.push(`Exception: ${event.title} - ${err}`);
    }
  }

  return imported;
}

function getNextDay(dateStr?: string | null): string {
  if (!dateStr) return "9999-12-31";
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split("T")[0];
}
