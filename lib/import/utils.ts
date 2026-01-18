import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared utilities for event import processors
 */

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

export async function generateUniqueSlug(
  supabase: SupabaseClient,
  baseSlug: string
): Promise<string> {
  let slug = baseSlug || "event";
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

export async function findOrCreateOrganizer(
  supabase: SupabaseClient,
  organizerName: string | null | undefined
): Promise<string | null> {
  if (!organizerName) return null;

  const slug = slugify(organizerName);
  if (!slug) return null;

  // Check if exists by slug or name
  const { data: existing } = await supabase
    .from("organizers")
    .select("id")
    .or(`slug.eq.${slug},name.ilike.${organizerName}`)
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Create new organizer
  const { data: created, error } = await supabase
    .from("organizers")
    .insert({
      slug,
      name: organizerName,
      description:
        "Organizer imported from event platform. Contact us to claim this profile!",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create organizer:", error);
    return null;
  }

  return created?.id || null;
}

export async function checkDuplicateByUrl(
  supabase: SupabaseClient,
  url: string
): Promise<boolean> {
  const { data } = await supabase
    .from("events")
    .select("id")
    .eq("external_chat_url", url)
    .limit(1)
    .single();

  return !!data;
}

export function parseEventDate(
  dateStr?: string,
  timeStr?: string
): string | null {
  if (!dateStr) return null;

  try {
    // Try ISO format first
    const iso = new Date(dateStr);
    if (!isNaN(iso.getTime())) {
      return iso.toISOString();
    }

    // Try with time appended
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

export function generateMapsUrl(
  latitude?: number | string,
  longitude?: number | string,
  locationName?: string,
  city?: string
): string | null {
  if (latitude && longitude) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  if (locationName) {
    const query = [locationName, city, "Vietnam"].filter(Boolean).join(", ");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  return null;
}

export interface ProcessResult {
  processed: number;
  skipped: number;
  errors: number;
  details: string[];
}

export function createEmptyResult(): ProcessResult {
  return { processed: 0, skipped: 0, errors: 0, details: [] };
}

/**
 * Download an image from an external URL and upload it to Supabase Storage.
 * Returns the permanent public URL, or null if the download/upload fails.
 *
 * This prevents dependency on external CDN URLs (Facebook, Instagram, etc.)
 * which often expire after hours or days.
 */
export async function downloadAndUploadImage(
  supabase: SupabaseClient,
  externalUrl: string | null | undefined,
  eventSlug: string
): Promise<string | null> {
  if (!externalUrl) return null;

  try {
    // Fetch the image from external URL
    const response = await fetch(externalUrl, {
      headers: {
        // Some CDNs require a user agent
        "User-Agent":
          "Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)",
      },
    });

    if (!response.ok) {
      console.warn(
        `Failed to download image from ${externalUrl}: ${response.status}`
      );
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    // Skip if too small (likely an error page) or too large
    if (buffer.byteLength < 1000) {
      console.warn(`Image too small, likely invalid: ${externalUrl}`);
      return null;
    }
    if (buffer.byteLength > 10 * 1024 * 1024) {
      console.warn(`Image too large (>10MB), skipping: ${externalUrl}`);
      return null;
    }

    // Determine file extension from content type
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[contentType] || "jpg";

    // Generate unique filename: eventSlug/timestamp.ext
    const fileName = `${eventSlug}/${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("event-media")
      .upload(fileName, buffer, {
        contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.warn(`Failed to upload image for ${eventSlug}:`, uploadError);
      return null;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("event-media").getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.warn(`Error downloading/uploading image from ${externalUrl}:`, error);
    return null;
  }
}
