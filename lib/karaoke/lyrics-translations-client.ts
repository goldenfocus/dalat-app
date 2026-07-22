import { createClient } from "@/lib/supabase/client";

/**
 * Client-side variant of getLyricsTranslationsMap — for surfaces that load
 * playlists in the browser (moments lightbox, home sections). Same contract:
 * track id → user-locale translated lyrics, one plain line per LRC line.
 */
export async function fetchLyricsTranslationsMap(
  trackIds: string[],
  locale: string
): Promise<Record<string, string>> {
  if (trackIds.length === 0) return {};
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("content_translations")
      .select("content_id, translated_text")
      .eq("content_type", "track")
      .eq("field_name", "lyrics")
      .eq("target_locale", locale)
      .in("content_id", trackIds);

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.translated_text) map[row.content_id] = row.translated_text;
    }
    return map;
  } catch {
    // Translations are an enhancement — karaoke works without them
    return {};
  }
}
