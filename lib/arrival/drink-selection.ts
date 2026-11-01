import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DrinkSelection = {
  items: { name_snapshot: string; qty: number }[];
} | null;

/** Private, request-scoped lookup shared by the event's drink entry points. */
export async function getDrinkSelection(eventId: string, userId: string | null): Promise<DrinkSelection | undefined> {
  if (!userId) return null;
  const db = await createClient();
  const { data, error } = await db.from("event_preorders")
    .select("event_preorder_items(name_snapshot,qty)")
    .eq("event_id", eventId).eq("user_id", userId)
    .in("status", ["pending", "confirmed", "fulfilled"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  // A failed lookup must not tell a guest their existing order is missing.
  if (error) return undefined;
  return data ? { items: data.event_preorder_items } : null;
}
