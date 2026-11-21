import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { ownedRentalStats } from "./stats";

export async function readRentalOwnerStats(db: Awaited<ReturnType<typeof createClient>>, target?: string) {
  const { data, error } = await db.rpc("rental_stats_owned", { target: target ?? null });
  const parsed = ownedRentalStats.safeParse(data);
  return error || !parsed.success ? null : parsed.data;
}
