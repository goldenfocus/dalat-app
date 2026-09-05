import type { SupabaseClient } from "@supabase/supabase-js";

/** Older listing RPCs omit media metadata. Restore only the public alt fields. */
export async function withReviewedMedia<T extends { id: string }>(
  supabase: SupabaseClient,
  events: T[],
): Promise<T[]> {
  if (events.length === 0) return events;
  const { data, error } = await supabase
    .from("events")
    .select("id, source_metadata")
    .in("id", events.map((event) => event.id));
  if (error) {
    console.error("Unable to load event image descriptions:", error);
    return events;
  }
  const media = new Map((data ?? []).map((row) => [row.id, row.source_metadata]));
  return events.map((event) => {
    const metadata = media.get(event.id);
    if (!metadata?.activity_media_url) return event;
    return {
      ...event,
      source_metadata: {
        activity_media_url: metadata.activity_media_url,
        activity_media_alt: metadata.activity_media_alt,
        activity_media_provenance: metadata.activity_media_provenance,
      },
    };
  });
}
