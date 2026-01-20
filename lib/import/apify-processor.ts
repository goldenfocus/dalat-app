import { createClient } from "@supabase/supabase-js";
import { processFacebookEvents } from "./processors/facebook";
import { processInstagramPosts } from "./processors/instagram";
import { processTikTokPosts } from "./processors/tiktok";
import { processEventbriteEvents } from "./processors/eventbrite";
import type {
  ApifyProcessorPayload,
  FacebookEvent,
  InstagramPost,
  TikTokPost,
  EventbriteEvent,
} from "./types";
import type { ProcessResult } from "./utils";

// Known Apify actor IDs mapped to platform processors
const ACTOR_MAP: Record<string, string> = {
  // Facebook scrapers
  "pratikdani/facebook-event-scraper": "facebook",
  "simpleapi/facebook-events-scraper": "facebook",
  // Instagram scrapers
  "apify/instagram-hashtag-scraper": "instagram",
  "apify/instagram-post-scraper": "instagram",
  // TikTok scrapers
  "clockworks/tiktok-hashtag-scraper": "tiktok",
  "apidojo/tiktok-location-scraper": "tiktok",
  // Eventbrite and multi-platform scrapers
  "newpo/eventbrite-scraper": "eventbrite",
  "barrierefix/event-scraper-pro": "eventbrite",
};

export async function processApifyPayload(
  payload: ApifyProcessorPayload
): Promise<ProcessResult> {
  const { actorId, items } = payload;

  if (!items || items.length === 0) {
    return { processed: 0, skipped: 0, errors: 0, details: ["No items to process"] };
  }

  // Determine processor based on actor ID or data structure
  const platform = ACTOR_MAP[actorId] || detectPlatformFromData(items[0]);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // For automated imports (webhooks), use system user if configured
  const systemUserId = process.env.SYSTEM_USER_ID;

  switch (platform) {
    case "facebook":
      return processFacebookEvents(supabase, items as FacebookEvent[], systemUserId);
    case "instagram":
      return processInstagramPosts(supabase, items as InstagramPost[]);
    case "tiktok":
      return processTikTokPosts(supabase, items as TikTokPost[]);
    case "eventbrite":
      return processEventbriteEvents(supabase, items as EventbriteEvent[], systemUserId);
    default:
      console.warn(`Unknown platform for actor: ${actorId}`);
      return {
        processed: 0,
        skipped: items.length,
        errors: 0,
        details: [`Unknown platform for actor: ${actorId}`],
      };
  }
}

// Fallback detection based on data structure
function detectPlatformFromData(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;

  const record = item as Record<string, unknown>;
  const url = record.url as string | undefined;

  if (url?.includes("facebook.com")) return "facebook";
  if (url?.includes("instagram.com")) return "instagram";
  if (url?.includes("tiktok.com")) return "tiktok";
  if (url?.includes("eventbrite.com")) return "eventbrite";
  if (url?.includes("meetup.com")) return "eventbrite";
  if (url?.includes("lu.ma")) return "eventbrite";

  // Check for platform-specific fields
  if ("goingCount" in record || "interestedCount" in record) return "facebook";
  if ("ownerUsername" in record || "shortCode" in record) return "instagram";
  if ("diggCount" in record || "authorMeta" in record) return "tiktok";

  return null;
}
