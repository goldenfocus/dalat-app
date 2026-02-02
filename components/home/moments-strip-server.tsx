import { createStaticClient } from "@/lib/supabase/server";
import { MomentsStrip } from "./moments-strip";

/**
 * Server component wrapper to fetch moments strip data.
 * Separated from the client component to avoid "use client" bundling issues.
 */
export async function MomentsStripServer() {
  const supabase = createStaticClient();
  if (!supabase) return null;

  const { data: moments, error } = await supabase.rpc('get_homepage_moments_strip', {
    p_user_id: null, // Anonymous user
    p_limit: 12,
  });

  if (error || !moments || moments.length === 0) {
    return null;
  }

  return <MomentsStrip initialMoments={moments} />;
}
