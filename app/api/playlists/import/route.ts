import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { noStoreJson } from "@/lib/http/no-store-json";
import { z } from "zod";

const selectionSchema = z.object({
  eventId: z.string().uuid(),
  sourcePlaylistId: z.string().uuid(),
  trackIds: z.array(z.string().uuid()).min(1).max(500).nullable(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  const eventId = request.nextUrl.searchParams.get("eventId");
  let ownerId = user.id;
  if (eventId) {
    if (!z.string().uuid().safeParse(eventId).success) return noStoreJson({ error: "Invalid event" }, { status: 400 });
    const { data: allowed } = await supabase.rpc("can_manage_event_playlist", { p_event_id: eventId });
    if (!allowed) return noStoreJson({ error: "Forbidden" }, { status: 403 });
    const { data: target } = await supabase.from("events").select("created_by").eq("id", eventId).single();
    if (!target) return noStoreJson({ error: "Event not found" }, { status: 404 });
    if (target.created_by !== user.id) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (!profile || !["admin", "superadmin"].includes(profile.role)) return noStoreJson({ error: "Forbidden" }, { status: 403 });
    }
    ownerId = target.created_by;
  }
  let query = supabase.from("event_playlists")
    .select("id, title, events!inner(id, title, starts_at, created_by), playlist_tracks(id, title, artist, duration_seconds, sort_order)")
    .eq("events.created_by", ownerId)
    .eq("events.status", "published")
    .lt("events.starts_at", new Date().toISOString());
  if (eventId) query = query.neq("event_id", eventId);
  const { data, error } = await query;
  if (error) return noStoreJson({ error: "Could not load past playlists" }, { status: 500 });
  return noStoreJson({ playlists: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return noStoreJson({ error: "Invalid playlist selection" }, { status: 400 });
  // The transaction validates target permissions and same-host source ownership,
  // then appends missing files under a target-event lock. Retries cannot duplicate tracks.
  const { data, error } = await supabase.rpc("import_event_playlist", {
    p_event_id: parsed.data.eventId,
    p_source_playlist_id: parsed.data.sourcePlaylistId,
    p_track_ids: parsed.data.trackIds,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 500;
    return noStoreJson({ error: status === 500 ? "Could not import tracks. Please try again." : error.message }, { status });
  }
  return noStoreJson(data);
}
