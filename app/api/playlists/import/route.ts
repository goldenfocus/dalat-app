import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { copyPlaylistTrack } from "@/lib/playlist-import";
import { z } from "zod";

const selectionSchema = z.object({
  eventId: z.string().uuid(),
  sourcePlaylistId: z.string().uuid(),
  trackIds: z.array(z.string().uuid()).min(1).max(500).nullable(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Only reuse music from events this account created; RLS also enforces visibility.
  const { data, error } = await supabase.from("event_playlists")
    .select("id, title, events!inner(id, title, starts_at, created_by), playlist_tracks(id, title, artist, duration_seconds, sort_order)")
    .eq("events.created_by", user.id)
    .lt("events.starts_at", new Date().toISOString());
  if (error) return NextResponse.json({ error: "Could not load past playlists" }, { status: 500 });
  return NextResponse.json({ playlists: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid playlist selection" }, { status: 400 });
  const { eventId, sourcePlaylistId, trackIds } = parsed.data;
  const { data: allowed } = await supabase.rpc("can_manage_event_playlist", { p_event_id: eventId });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: source, error: sourceError } = await supabase.from("event_playlists")
    .select("id, title, description, events!inner(id, created_by, starts_at), playlist_tracks(*)")
    .eq("id", sourcePlaylistId).eq("events.created_by", user.id)
    .lt("events.starts_at", new Date().toISOString()).single();
  if (sourceError || !source) return NextResponse.json({ error: "Source playlist is no longer available" }, { status: 404 });
  const available = source.playlist_tracks as Record<string, unknown>[];
  if (trackIds?.some(id => !available.some(track => track.id === id))) {
    return NextResponse.json({ error: "A selected track is no longer available" }, { status: 409 });
  }
  const tracks = available.filter(track => !trackIds || trackIds.includes(track.id as string))
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || String(a.created_at).localeCompare(String(b.created_at)));
  if (!tracks.length) return NextResponse.json({ error: "The playlist has no tracks" }, { status: 400 });
  const { data: playlist, error: playlistError } = await supabase.from("event_playlists")
    .insert({ event_id: eventId, created_by: user.id, title: source.title, description: source.description })
    .select("id").single();
  if (playlistError || !playlist) return NextResponse.json({ error: "This event already has a playlist, or it could not be created" }, { status: 409 });
  const { error: trackError } = await supabase.from("playlist_tracks")
    .insert(tracks.map((track, index) => copyPlaylistTrack(track, playlist.id, index)));
  if (trackError) {
    // A bulk insert is atomic. Remove our empty playlist so the host can retry in edit.
    await supabase.from("event_playlists").delete().eq("id", playlist.id);
    return NextResponse.json({ error: "Could not import the tracks" }, { status: 500 });
  }
  return NextResponse.json({ playlistId: playlist.id, count: tracks.length });
}
