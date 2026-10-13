import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Owner, accepted owner/editor manager, or admin may edit a venue page. */
export async function venueEditor(venueId: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const [{ data: venue }, { data: profile }, { data: manager }] = await Promise.all([
    db.from("venues").select("id,owner_id").eq("id", venueId).maybeSingle(),
    db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    db.from("venue_managers").select("role,accepted_at").eq("venue_id", venueId).eq("profile_id", user.id).maybeSingle(),
  ]);
  if (!venue) return null;
  const ok =
    venue.owner_id === user.id ||
    ["admin", "superadmin", "moderator"].includes(profile?.role || "") ||
    (!!manager?.accepted_at && ["owner", "editor"].includes(manager.role));
  return ok ? { user, db } : null;
}
