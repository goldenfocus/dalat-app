import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ManagedVenue = { id: string; slug: string; name: string };

/** Management is based on ownership or an accepted editing invitation, never staff duty. */
export async function managedVenues(): Promise<ManagedVenue[]> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const [owned, invitations] = await Promise.all([
    db.from("venues").select("id,slug,name").eq("owner_id", user.id),
    db.from("venue_managers").select("venue_id").eq("profile_id", user.id)
      .not("accepted_at", "is", null).in("role", ["owner", "editor"]),
  ]);
  if (owned.error) throw owned.error;
  if (invitations.error) throw invitations.error;
  const ids = (invitations.data || []).map(row => row.venue_id);
  const invited = ids.length ? await db.from("venues").select("id,slug,name").in("id", ids) : { data: [], error: null };
  if (invited.error) throw invited.error;
  return [...new Map([...(owned.data || []), ...(invited.data || [])].map(venue => [venue.id, venue])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
}
