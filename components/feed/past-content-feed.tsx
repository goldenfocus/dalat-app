import { withVenueCredits } from "@/lib/moments/venue-credit";
import { createClient } from "@/lib/supabase/server";
import { ContentCarousel } from "./content-carousel";
import type { MomentWithEvent } from "@/lib/types";

const CAROUSEL_LIMIT = 10;

async function getFeedMoments(): Promise<MomentWithEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_feed_moments", {
    p_limit: CAROUSEL_LIMIT,
    p_offset: 0,
    p_content_types: ["photo", "video"],
  });

  if (error) {
    console.error("Failed to fetch feed moments:", error);
    return [];
  }

  return withVenueCredits(supabase, (data ?? []) as MomentWithEvent[]);
}

/**
 * Async server component that fetches and displays the content carousel.
 * Only renders when there are moments to show.
 */
export async function PastContentFeed() {
  const moments = await getFeedMoments();

  if (moments.length === 0) {
    return null;
  }

  return <ContentCarousel moments={moments} />;
}
