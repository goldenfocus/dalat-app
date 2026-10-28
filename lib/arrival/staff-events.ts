import "server-only";
import { createClient } from "@/lib/supabase/server";
import { arrivalAdmin } from "./server";
import type { ArrivalAccess } from "./types";

export type StaffEvent = { id: string; slug: string; title: string; starts_at: string };

/** Candidate scopes are only an optimization: arrival_access remains the authority. */
export async function staffEvents(): Promise<StaffEvent[]> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const admin = arrivalAdmin();
  const [profile, assignments, ownedVenues, managedVenues] = await Promise.all([
    admin.from("profiles").select("role").eq("id", user.id).single(),
    admin.from("event_staff").select("event_id").eq("user_id", user.id),
    admin.from("venues").select("id").eq("owner_id", user.id),
    admin.from("venue_managers").select("venue_id").eq("profile_id", user.id)
      .not("accepted_at", "is", null).in("role", ["owner", "editor"]),
  ]);
  for (const result of [profile, assignments, ownedVenues, managedVenues]) {
    if (result.error) throw result.error;
  }
  const scopes = [`created_by.eq.${user.id}`];
  const eventIds = (assignments.data || []).map(row => row.event_id);
  const venueIds = [...new Set([
    ...(ownedVenues.data || []).map(row => row.id),
    ...(managedVenues.data || []).map(row => row.venue_id),
  ])];
  if (eventIds.length) scopes.push(`id.in.(${eventIds.join(",")})`);
  if (venueIds.length) scopes.push(`venue_id.in.(${venueIds.join(",")})`);
  if (profile.data?.role === "moderator") scopes.push("venue_id.not.is.null");
  let query = admin.from("events").select("id,slug,title,starts_at")
    .eq("status", "published").eq("arrival_enabled", true)
    .or("tribe_id.is.null,tribe_visibility.eq.public")
    .gte("starts_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .order("starts_at", { ascending: true }).limit(50);
  if (!["admin", "superadmin"].includes(profile.data?.role || "")) query = query.or(scopes.join(","));
  const { data, error } = await query;
  if (error) throw error;
  const checked = await Promise.all((data || []).map(async (event: StaffEvent) => {
    const result = await admin.rpc("arrival_access", { p_event_id: event.id, p_actor_id: user.id });
    if (result.error) throw result.error;
    const access = result.data as ArrivalAccess | null;
    return access && (access.canWelcome || access.canOrder || access.canManage) ? event : null;
  }));
  return checked.filter((event): event is StaffEvent => event !== null);
}
