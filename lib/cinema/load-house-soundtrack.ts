import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AudioTrack, PlaylistInfo } from "@/lib/stores/audio-player-store";
import { moodsForHints, resolveSoundtrack } from "./resolve-soundtrack";

const houseTrackSchema = z.object({
  id: z.string().uuid(),
  file_url: z.string().url(),
  title: z.string().nullable(),
  artist: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  mood: z.string().nullable(),
});

type HouseTrack = AudioTrack & { mood: string | null };

export interface HouseSoundtrack {
  tracks: AudioTrack[];
  playlistInfo: PlaylistInfo;
}

/**
 * Picks the house soundtrack for an event that has no music of its own.
 * Returns null (a clean no-op) when the library is empty, unreadable or the
 * table has not been migrated yet. Never generates or copies audio.
 */
export async function loadHouseSoundtrack(
  db: SupabaseClient,
  event: { id: string; slug: string; title: string; image_url: string | null; ai_tags?: string[] | null; activity_kind?: string | null },
): Promise<HouseSoundtrack | null> {
  const { data, error } = await db
    .from("house_tracks")
    .select("id,file_url,title,artist,thumbnail_url,duration_seconds,mood")
    .eq("is_active", true)
    .limit(500);
  if (error || !data?.length) return null;

  const houseTracks: HouseTrack[] = [];
  for (const row of data) {
    const parsed = houseTrackSchema.safeParse(row);
    if (!parsed.success) continue;
    houseTracks.push({ ...parsed.data, album: null });
  }

  const { tracks, isHouse } = resolveSoundtrack<HouseTrack>({
    eventId: event.id,
    eventTracks: [],
    houseTracks,
    preferredMoods: moodsForHints([...(event.ai_tags ?? []), event.activity_kind]),
  });
  if (!isHouse) return null;

  return {
    tracks: tracks.map(({ mood: _mood, ...track }) => track),
    playlistInfo: {
      eventId: event.id,
      eventSlug: event.slug,
      eventTitle: event.title,
      eventImageUrl: event.image_url,
      isHouse: true,
    },
  };
}
