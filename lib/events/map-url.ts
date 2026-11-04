import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LOCATION_VENUE_FIELDS,
  getLocationMapLinks,
  resolveEventLocation,
  type LocationVenue,
} from "@/lib/events/location";

/**
 * Map link for notifications: resolved exactly like the event page (venue and
 * series venue override, coordinates first) instead of the raw stored column.
 */
export async function getEventMapUrl(
  supabase: SupabaseClient,
  eventId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("events")
    .select(
      `location_name, address, google_maps_url, latitude, longitude, is_online, has_private_details, venue_id, venues(${LOCATION_VENUE_FIELDS}), event_series(venues(${LOCATION_VENUE_FIELDS}))`,
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  const joined = data as unknown as {
    venue_id: string | null;
    venues: LocationVenue | null;
    event_series: { venues: LocationVenue | null } | null;
  };
  const event = resolveEventLocation(
    data,
    joined.venue_id ? joined.venues : joined.event_series?.venues,
  );
  return getLocationMapLinks(event).map;
}
