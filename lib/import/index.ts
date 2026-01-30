/**
 * Event Import Module
 *
 * Handles importing events from various platforms via Apify webhooks.
 */

export { processApifyPayload } from "./apify-processor";
export type {
  ApifyWebhookPayload,
  ApifyProcessorPayload,
  FacebookEvent,
  InstagramPost,
  TikTokPost,
  EventbriteEvent,
  ExtractedEvent,
} from "./types";
export type { ProcessResult } from "./utils";

// Flip.vn scraper
export {
  fetchFlipEvent,
  discoverFlipEvents,
  processFlipEvents,
  type FlipEvent,
} from "./processors/flip";

// TicketGo scraper
export {
  fetchTicketGoEvent,
  discoverTicketGoEvents,
  processTicketGoEvents,
  type TicketGoEvent,
} from "./processors/ticketgo";
