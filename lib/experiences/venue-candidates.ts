import "server-only";
import { createClient } from "@/lib/supabase/server";
import { rankVenues } from "./venue-match";
export async function venueCandidates(query: string) {
  if (query.trim().length < 2) return [];
  const db = await createClient();
  // Bounded city catalog. Suggestions never create or silently select an entity.
  const { data, error } = await db
    .from("venues")
    .select("id,name,address")
    .order("name")
    .limit(1000);
  return error ? [] : rankVenues(query.slice(0, 200), data || []);
}
