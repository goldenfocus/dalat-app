import { createStaticClient } from "@/lib/supabase/server";
import { MomentsStrip } from "./moments-strip";

/**
 * Server component wrapper to fetch moments strip data.
 * Separated from the client component to avoid "use client" bundling issues.
 * Default sort is 'event_date' (by when the event happened).
 */
export async function MomentsStripServer() {
  const supabase = createStaticClient();
  if (!supabase) return null;

  // Fetch with default 'event_date' sort - client can refetch with different sort
  const { data: moments, error } = await supabase.rpc('get_homepage_moments_strip', {
    p_user_id: null,
    p_limit: 12,
    p_sort: 'event_date',
  });

  if (error || !moments || moments.length === 0) {
    return null;
  }

  return <MomentsStrip initialMoments={moments} />;
}
