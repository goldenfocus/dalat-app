import { SupabaseClient } from "@supabase/supabase-js";
import { parse as parseDateFns, isValid as isValidDate, format as formatDate } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { getStorageProvider } from "@/lib/storage";

const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";

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

  // Look up by slug. (Slug is derived from the name, so this covers exact
  // name matches too. An .or() filter string is NOT safe here: Vietnamese
  // organizer names contain commas — "Sở Văn hóa, Thể thao..." — which
  // PostgREST parses as condition separators, silently breaking the lookup
  // and turning every re-import into a duplicate-slug insert error.)
  const { data: existing } = await supabase
    .from("organizers")
    .select("id")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();

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
    // ISO / RFC formats carry their own structure — trust the platform parser.
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const withTime =
        timeStr && !dateStr.includes("T") ? `${dateStr}T${timeStr}` : dateStr;
      const iso = new Date(withTime);
      return isNaN(iso.getTime()) ? null : iso.toISOString();
    }

    // Vietnamese day-first formats, interpreted in Đà Lạt time.
    // new Date("25/07/2026") would read as MM/DD → wrong-month event with no error.
    const time = timeStr && /^\d{1,2}:\d{2}/.test(timeStr) ? timeStr : "00:00";
    for (const fmt of ["dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy"]) {
      const parsed = parseDateFns(dateStr.trim(), fmt, new Date());
      if (isValidDate(parsed)) {
        const local = `${formatDate(parsed, "yyyy-MM-dd")}T${time}`;
        return fromZonedTime(local, DALAT_TIMEZONE).toISOString();
      }
    }
  } catch {
    // Fall through
  }

  // Unparseable dates are a skip (counted upstream), never a guess.
  return null;
}

/**
 * Normalize Facebook event URL variants (m./mbasic./bare host, trailing slash,
 * tracking params, ?event_time_id for recurring events) to one canonical form,
 * so exact-match dedupe on external_chat_url doesn't re-import the same event.
 */
export function canonicalizeFacebookEventUrl(url: string): string {
  const match = url.match(/facebook\.com\/events\/(\d+)/i);
  return match ? `https://www.facebook.com/events/${match[1]}` : url;
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
 * Download an image from an external URL and upload it to Cloudflare R2.
 * Returns the permanent CDN URL, or null if the download/upload fails.
 *
 * This prevents dependency on external CDN URLs (Facebook, Instagram, etc.)
 * which often expire after hours or days.
 */
export async function downloadAndUploadImage(
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

    // Skip if too small or too large. Real cover photos are never under a
    // few KB — sub-5KB files are page chrome (a 24x16 language-flag icon
    // shipped as blurry event covers on Jul 10 2026), tracking pixels, or
    // error pages.
    if (buffer.byteLength < 5000) {
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

    // Upload via the storage provider (R2 → cdn.dalat.app; Supabase Storage is banned)
    const provider = await getStorageProvider("event-media");
    const publicUrl = await provider.upload(
      "event-media",
      fileName,
      Buffer.from(buffer),
      { contentType, cacheControl: "3600" }
    );

    return publicUrl;
  } catch (error) {
    console.warn(`Error downloading/uploading image from ${externalUrl}:`, error);
    return null;
  }
}
