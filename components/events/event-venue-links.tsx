import { Link } from "@/lib/i18n/routing";
import { createStaticClient } from "@/lib/supabase/server";
import { OfficialVenueLinks } from "@/components/venues/official-links";

/** Official links belong to the venue, so every past/future occurrence stays current. */
export async function EventVenueLinks({ venueId, organizerId }: { venueId?: string; organizerId?: string }) {
  const db = createStaticClient();
  if (!db || (!venueId && !organizerId)) return null;
  const query = db.from("venues").select("slug,name,website_url,menu_url");
  // A venue-backed organizer can also host an outdoor event. Link its business
  // without changing the event's location; ambiguous multi-venue organizers skip.
  const { data: venue } = await (venueId ? query.eq("id", venueId) : query.eq("organizer_id", organizerId!)).maybeSingle();
  if (!venue || (!venue.website_url && !venue.menu_url)) return null;
  return <aside className="space-y-3 rounded-xl border p-4">
    <Link href={`/${venue.slug}`} className="font-semibold hover:underline">{venue.name}</Link>
    <OfficialVenueLinks website={venue.website_url} menu={venue.menu_url} name={venue.name} />
  </aside>;
}
