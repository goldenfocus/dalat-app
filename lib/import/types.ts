/**
 * Type definitions for Apify import processors
 */

// Facebook Event from pratikdani/facebook-event-scraper
export interface FacebookEvent {
  url: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  utcStartDate?: string;
  utcEndDate?: string;
  // Location - can be nested or flat
  location?: {
    name?: string;
    address?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  "location.name"?: string;
  "location.address"?: string;
  "location.city"?: string;
  "location.latitude"?: number;
  "location.longitude"?: number;
  // Organizer
  organizer?: {
    name?: string;
    url?: string;
  };
  organizedBy?: string;
  // Media
  coverPhoto?: string;
  imageUrl?: string;
  images?: string[];
  // Engagement
  goingCount?: number;
  interestedCount?: number;
  usersGoing?: number;
  usersInterested?: number;
  // Tickets
  ticketUrl?: string;
}

// Instagram post from various scrapers
export interface InstagramPost {
  url: string;
  shortCode?: string;
  caption?: string;
  displayUrl?: string;
  images?: string[];
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  locationName?: string;
  locationId?: string;
  likesCount?: number;
  commentsCount?: number;
  hashtags?: string[];
}

// TikTok post from various scrapers
export interface TikTokPost {
  url?: string;
  webVideoUrl?: string;
  text?: string;
  description?: string;
  createTime?: number;
  createTimeISO?: string;
  authorMeta?: {
    name?: string;
    nickName?: string;
  };
  locationCreated?: string;
  videoMeta?: {
    coverUrl?: string;
  };
  covers?: string[];
  diggCount?: number;
  shareCount?: number;
  commentCount?: number;
  hashtags?: Array<{ name: string }>;
}

// Eventbrite/Meetup/Lu.ma event
export interface EventbriteEvent {
  url: string;
  name?: string;
  title?: string;
  description?: string;
  summary?: string;
  start?: { local?: string; utc?: string };
  end?: { local?: string; utc?: string };
  startTime?: string;
  endTime?: string;
  venue?: {
    name?: string;
    address?: {
      localized_address_display?: string;
      city?: string;
      latitude?: string;
      longitude?: string;
    };
  };
  location?: string;
  organizer?: {
    name?: string;
    url?: string;
  };
  hostName?: string;
  logo?: { url?: string };
  imageUrl?: string;
  coverImage?: string;
  is_free?: boolean;
  ticket_availability?: {
    minimum_ticket_price?: { display?: string };
  };
}

// AI-extracted event from social media caption
export interface ExtractedEvent {
  isEvent: boolean;
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  location?: string;
  ticketInfo?: string;
}

// Apify webhook payload
export interface ApifyWebhookPayload {
  actorId: string;
  actorRunId: string;
  datasetId: string;
  eventType: string;
  resource?: Record<string, unknown>;
}

// Processor payload (after fetching dataset)
export interface ApifyProcessorPayload {
  actorId: string;
  actorRunId: string;
  items: unknown[];
}
