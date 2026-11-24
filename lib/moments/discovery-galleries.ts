import type { SupabaseClient } from "@supabase/supabase-js";
import { withGroupVenueCredits } from "@/lib/moments/venue-credit";
import { formatInDaLatAsync } from "@/lib/timezone";
import type { DiscoveryEventMomentsGroup, Locale, MomentContentType } from "@/lib/types";

export const DISCOVERY_EVENTS_PER_PAGE = 5;
export const DISCOVERY_MEDIA_TYPES: MomentContentType[] = ["photo", "video"];

export type DiscoveryGallery = DiscoveryEventMomentsGroup & {
  dateLabel: string;
  description?: string;
  translatedTitle?: string;
  translatedDescription?: string;
};

export async function getDiscoveryGalleries(
  db: SupabaseClient,
  locale: Locale,
  contentTypes = DISCOVERY_MEDIA_TYPES,
  offset = 0,
): Promise<DiscoveryGallery[]> {
  const { data, error } = await db.rpc("get_feed_moments_grouped", {
    p_event_limit: DISCOVERY_EVENTS_PER_PAGE,
    p_moments_per_event: 4,
    p_event_offset: offset,
    p_content_types: contentTypes,
  });

  if (error) throw error;
  const groups = (data ?? []) as DiscoveryEventMomentsGroup[];
  if (groups.length === 0) return [];

  const ids = groups.map((group) => group.event_id);
  const [credited, { data: events }, { data: translations }, dates] = await Promise.all([
    withGroupVenueCredits(db, groups),
    db.from("events").select("id,description").in("id", ids).eq("status", "published"),
    db.from("content_translations")
      .select("content_id,field_name,translated_text")
      .eq("content_type", "event")
      .eq("target_locale", locale)
      .in("content_id", ids)
      .in("field_name", ["title", "description"]),
    Promise.all(groups.map((group) => formatInDaLatAsync(group.event_starts_at, "PP", locale))),
  ]);

  const descriptions = new Map(events?.map((event) => [event.id, event.description]));
  const localized = new Map(translations?.map((row) => [
    `${row.content_id}:${row.field_name}`,
    row.translated_text,
  ]));

  return credited.map((group, index) => ({
    ...group,
    dateLabel: dates[index],
    description: descriptions.get(group.event_id) || undefined,
    translatedTitle: localized.get(`${group.event_id}:title`),
    translatedDescription: localized.get(`${group.event_id}:description`),
  }));
}
