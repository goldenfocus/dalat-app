import "server-only";
import { createClient } from "@/lib/supabase/server";
import { venueEditor } from "./access";

/** Only a readable public event at a venue the viewer can edit is eligible. */
export async function venueEventEditor(slug: string) {
  const db = await createClient();
  const { data: event, error } = await db.from("events")
    .select("id,slug,title,description,starts_at,ends_at,capacity,venue_id,series_id,updated_at,tribe_id,tribe_visibility,status")
    .eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!event?.venue_id || event.status !== "published" || (event.tribe_id && event.tribe_visibility !== "public")) return null;
  const editor = await venueEditor(event.venue_id);
  return editor ? { ...editor, event } : null;
}
