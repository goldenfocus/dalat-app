import "server-only";
import { createStaticClient } from "@/lib/supabase/server";
import type { VenueHighlight } from "./highlights";

/** Always use anonymous RLS, even when the visitor is an owner or admin. */
export async function getVenueHighlightPhotos(venueId: string): Promise<VenueHighlight[]> {
  const db = createStaticClient();
  if (!db) return [];
  const photos: VenueHighlight[] = [];
  const cutoff = new Date().toISOString();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("moments")
      .select("id,media_url,thumbnail_url,event_id,created_at,featured_priority,view_count,moment_metadata(quality_score),events!moments_event_id_fkey!inner(slug,title,venue_id,status,starts_at,ends_at,has_private_details)")
      .eq("status", "published").eq("content_type", "photo").not("media_url", "is", null)
      .eq("events.venue_id", venueId).eq("events.status", "published")
      .eq("events.has_private_details", false)
      .lt("events.starts_at", cutoff)
      .order("created_at", { ascending: false }).order("id")
      .range(offset, offset + 499);
    if (error) throw new Error(`Venue highlights unavailable: ${error.code}`);
    for (const row of data || []) {
      const event = (Array.isArray(row.events) ? row.events[0] : row.events) as { slug: string; title: string; starts_at: string; ends_at: string | null };
      if (new Date(event.ends_at || new Date(new Date(event.starts_at).getTime() + 4 * 3600000)).toISOString() >= cutoff) continue;
      const metadata = (Array.isArray(row.moment_metadata) ? row.moment_metadata[0] : row.moment_metadata) as { quality_score: number | null } | null;
      photos.push({ id: row.id, media_url: row.media_url!, thumbnail_url: row.thumbnail_url,
        event_id: row.event_id, event_slug: event.slug, event_title: event.title,
        created_at: row.created_at, featured_priority: row.featured_priority || 0, view_count: row.view_count || 0, quality_score: metadata?.quality_score ?? 0.5 });
    }
    if (!data || data.length < 500) break;
  }
  return photos;
}
