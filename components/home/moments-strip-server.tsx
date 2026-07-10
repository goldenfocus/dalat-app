import { getCachedHomepageMomentsStrip } from "@/lib/cache/server-cache";
import { MomentsStrip } from "./moments-strip";

/**
 * Server component wrapper to fetch moments strip data.
 * Separated from the client component to avoid "use client" bundling issues.
 * Default sort is 'event_date' (by when the event happened).
 * Uses unstable_cache so ISR regenerations don't hit Supabase every time.
 */
export async function MomentsStripServer() {
  // 6 thumbs is enough for the strip (mobile scroll + desktop 6-col) — half the LCP competition
  const moments = await getCachedHomepageMomentsStrip(6, "event_date");

  if (!moments || moments.length === 0) {
    return null;
  }

  return <MomentsStrip initialMoments={moments} />;
}
