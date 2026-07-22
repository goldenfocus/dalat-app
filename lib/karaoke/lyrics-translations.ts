import { createStaticClient } from "@/lib/supabase/server";

/**
 * Batch-fetch translated lyrics for a set of tracks in one locale.
 * Translations are plain text, one line per LRC lyric line, "\n"-joined —
 * written by the lyrics pipeline so line N pairs with LRC line N.
 */
export async function getLyricsTranslationsMap(
  trackIds: string[],
  locale: string
): Promise<Record<string, string>> {
  if (trackIds.length === 0) return {};
  const supabase = createStaticClient();
  if (!supabase) return {};

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
}
