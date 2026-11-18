import { Link } from "@/lib/i18n/routing";
import { createStaticClient } from "@/lib/supabase/server";
import { OfficialVenueLinks } from "@/components/venues/official-links";

/** Official links belong to the venue, so every past/future occurrence stays current. */
export async function EventVenueLinks({ venueId }: { venueId: string }) {
  const db = createStaticClient();
  if (!db) return null;
  const { data: venue } = await db.from("venues").select("slug,name,website_url,menu_url").eq("id", venueId).maybeSingle();
  if (!venue || (!venue.website_url && !venue.menu_url)) return null;
  return <aside className="space-y-3 rounded-xl border p-4">
    <Link href={`/${venue.slug}`} className="font-semibold hover:underline">{venue.name}</Link>
    <OfficialVenueLinks website={venue.website_url} menu={venue.menu_url} name={venue.name} />
  </aside>;
}
