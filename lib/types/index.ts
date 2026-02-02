// The Global Twelve - unified locale system for UI and content
export type Locale = 'en' | 'vi' | 'ko' | 'zh' | 'ru' | 'fr' | 'ja' | 'ms' | 'th' | 'de' | 'es' | 'id';

// Notification mode preferences
export type NotificationMode = 'sound_and_vibration' | 'sound_only' | 'vibration_only' | 'silent';

export const NOTIFICATION_MODES: NotificationMode[] = [
  'sound_and_vibration',
  'sound_only',
  'vibration_only',
  'silent',
];

// ContentLocale is now an alias for backwards compatibility
export type ContentLocale = Locale;

export const LOCALES: Locale[] = ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'];

// Backwards compatibility alias
export const CONTENT_LOCALES: ContentLocale[] = LOCALES;

export const LOCALE_FLAGS: Record<ContentLocale, string> = {
  en: '🇬🇧', vi: '🇻🇳', ko: '🇰🇷', zh: '🇨🇳',
  ru: '🇷🇺', fr: '🇫🇷', ja: '🇯🇵', ms: '🇲🇾',
  th: '🇹🇭', de: '🇩🇪', es: '🇪🇸', id: '🇮🇩'
};

export const LOCALE_NAMES: Record<ContentLocale, string> = {
  en: 'English', vi: 'Tiếng Việt', ko: '한국어', zh: '中文',
  ru: 'Русский', fr: 'Français', ja: '日本語', ms: 'Melayu',
  th: 'ไทย', de: 'Deutsch', es: 'Español', id: 'Indonesian'
};

// Translation types
export type TranslationStatus = 'auto' | 'reviewed' | 'edited';
export type TranslationContentType = 'event' | 'moment' | 'profile' | 'blog' | 'venue' | 'comment' | 'organizer';
export type TranslationFieldName = 'title' | 'description' | 'text_content' | 'bio' | 'story_content' | 'technical_content' | 'meta_description' | 'image_alt' | 'image_description';

// Event pricing types
export type PriceType = 'free' | 'paid' | 'donation';

export interface TicketTier {
  name: string;
  price: number;
  currency: string;
  description?: string;
}

export interface ContentTranslation {
  id: string;
  content_type: TranslationContentType;
  content_id: string;
  source_locale: ContentLocale;
  target_locale: ContentLocale;
  field_name: TranslationFieldName;
  translated_text: string;
  translation_status: TranslationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Extended role hierarchy
export type UserRole =
  | 'user'
  | 'superadmin'
  | 'admin'
  | 'moderator'
  | 'organizer_verified'
  | 'organizer_pending'
  | 'contributor';

// Role hierarchy levels (higher = more permissions)
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  superadmin: 200,
  admin: 100,
  moderator: 80,
  organizer_verified: 60,
  organizer_pending: 50,
  contributor: 40,
  user: 10,
};

// Check if a user role has at least the required level
export function hasRoleLevel(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// Organizer types
export type OrganizerType =
  | 'ward'           // Phường
  | 'city'           // Thành phố
  | 'venue'          // Venue/location
  | 'cultural_org'   // Cultural organization
  | 'committee'      // Festival committee
  | 'business'       // Business
  | 'other';

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  bio_source_locale: string | null;
  avatar_url: string | null;
  locale: Locale;
  role: UserRole;
  is_ghost?: boolean;
  can_blog?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Organizer {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  zalo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  organizer_type: OrganizerType;
  is_verified: boolean;
  priority_score: number;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: Profile;
}

// ============================================
// Venue Types (WHERE events happen)
// ============================================

export type VenueType =
  | 'cafe'
  | 'bar'
  | 'restaurant'
  | 'gallery'
  | 'park'
  | 'hotel'
  | 'coworking'
  | 'community_center'
  | 'outdoor'
  | 'homestay'
  | 'other';

export interface OperatingHours {
  monday?: { open: string; close: string } | 'closed';
  tuesday?: { open: string; close: string } | 'closed';
  wednesday?: { open: string; close: string } | 'closed';
  thursday?: { open: string; close: string } | 'closed';
  friday?: { open: string; close: string } | 'closed';
  saturday?: { open: string; close: string } | 'closed';
  sunday?: { open: string; close: string } | 'closed';
}

export interface VenuePhoto {
  url: string;
  caption?: string;
  sort_order: number;
}

export interface Venue {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  venue_type: VenueType | null;

  // Location (required)
  latitude: number;
  longitude: number;
  address: string | null;
  google_maps_url: string | null;
  google_place_id: string | null;

  // Contact
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  zalo_url: string | null;
  phone: string | null;
  email: string | null;

  // Details
  operating_hours: OperatingHours | null;
  has_wifi: boolean;
  has_parking: boolean;
  has_outdoor_seating: boolean;
  is_pet_friendly: boolean;
  is_wheelchair_accessible: boolean;

  // Enhanced
  capacity: number | null;
  price_range: '$' | '$$' | '$$$' | '$$$$' | null;
  tags: string[];
  cuisine_types: string[];
  photos: VenuePhoto[];

  // Media
  logo_url: string | null;
  cover_photo_url: string | null;

  // Meta
  owner_id: string | null;
  organizer_id: string | null;
  is_verified: boolean;
  priority_score: number;
  total_events_hosted: number;
  last_event_at: string | null;
  source_locale: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;

  // Joined data
  profiles?: Profile;
}

// Venue for map display (minimal data)
export interface VenueMapMarker {
  id: string;
  slug: string;
  name: string;
  venue_type: string | null;
  latitude: number;
  longitude: number;
  logo_url: string | null;
  is_verified: boolean;
  upcoming_event_count: number;
  has_happening_now: boolean;
}

// Venue for discovery list
export interface VenueListItem {
  id: string;
  slug: string;
  name: string;
  venue_type: string | null;
  logo_url: string | null;
  cover_photo_url: string | null;
  address: string | null;
  is_verified: boolean;
  price_range: string | null;
  tags: string[];
  operating_hours: OperatingHours | null;
  upcoming_event_count: number;
  has_happening_now: boolean;
}

// AI Persona for image generation @mentions
export interface Persona {
  id: string;
  handle: string;
  name: string;
  context: string | null;
  style: string | null;
  reference_images: string[];
  created_at: string;
  updated_at: string;
}

// ============================================
// Tribe Types (V2 - Enhanced Membership System)
// ============================================

export type TribeAccessType = 'public' | 'request' | 'invite_only' | 'secret';
export type TribeMemberRole = 'member' | 'admin' | 'leader';
export type TribeMemberStatus = 'active' | 'banned';
export type TribeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type TribeEventVisibility = 'public' | 'members_only';

export interface Tribe {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  access_type: TribeAccessType;
  invite_code: string | null;
  invite_code_expires_at: string | null;
  is_listed: boolean;
  settings: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: Profile;
  member_count?: number;
  is_member?: boolean;
  user_role?: TribeMemberRole;
  user_status?: TribeMemberStatus;
}

export interface TribeMember {
  id: string;
  tribe_id: string;
  user_id: string;
  role: TribeMemberRole;
  status: TribeMemberStatus;
  invited_by: string | null;
  joined_at: string;
  show_on_profile: boolean;
  // Joined data
  profiles?: Profile;
  tribes?: Tribe;
}

export interface TribeRequest {
  id: string;
  tribe_id: string;
  user_id: string;
  message: string | null;
  status: TribeRequestStatus;
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
  // Joined data
  profiles?: Profile;
  tribes?: Tribe;
}

// ============================================
// Invitation Channel Types (Future-proof)
// ============================================

export type InviteChannel = 'email' | 'sms' | 'whatsapp' | 'zalo' | 'in_app';

export interface InviteRecipient {
  identifier: string; // email, phone, or user_id depending on channel
  name?: string;
}

export interface BulkInviteRequest {
  eventId: string;
  channel: InviteChannel;
  recipients: InviteRecipient[];
}

export interface InviteResult {
  identifier: string;
  success: boolean;
  error?: string;
  inviteId?: string;
}

export interface Event {
  id: string;
  slug: string;
  previous_slugs: string[];
  tribe_id: string | null;
  tribe_visibility: TribeEventVisibility;
  organizer_id: string | null;
  venue_id: string | null;  // WHERE the event happens (physical location)
  title: string;
  description: string | null;
  image_url: string | null;
  location_name: string | null;
  address: string | null;
  google_maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  external_chat_url: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  capacity: number | null;
  // Online event support
  is_online: boolean;
  online_link: string | null;
  // Flyer customization
  title_position: "top" | "middle" | "bottom";
  image_fit: "cover" | "contain";
  focal_point: string | null; // e.g., "50% 80%" for object-position
  // Pricing
  price_type: PriceType | null;
  ticket_tiers: TicketTier[] | null;
  status: "draft" | "published" | "cancelled";
  created_by: string;
  created_at: string;
  updated_at: string;
  // Translation tracking
  source_locale: string | null;
  // AI features
  ai_tags: string[];
  ai_tags_updated_at: string | null;
  spam_score: number;
  spam_reason: string | null;
  spam_checked_at: string | null;
  // Sponsorship/Premium placement
  sponsor_tier: number | null;
  // Series fields (for recurring event instances)
  series_id: string | null;
  series_instance_date: string | null;
  is_exception: boolean;
  exception_type: "modified" | "cancelled" | "rescheduled" | null;
  // Joined data
  profiles?: Profile;
  tribes?: Tribe;
  organizers?: Organizer;
  venues?: Venue;  // WHERE the event happens
  event_series?: EventSeries;
}

export interface Rsvp {
  id: string;
  event_id: string;
  user_id: string;
  status: "going" | "waitlist" | "cancelled" | "interested";
  plus_ones: number;
  created_at: string;
  // Joined data
  profiles?: Profile;
}

export interface EventCounts {
  event_id: string;
  going_count: number;
  going_spots: number;
  waitlist_count: number;
  interested_count: number;
}

/**
 * Event with series metadata from deduplicated feed RPC.
 * Extends Event with series info for badge display.
 */
export interface EventWithSeriesData extends Event {
  series_slug: string | null;
  series_rrule: string | null;
  is_recurring: boolean;
}

// ============================================
// Verification Request Types
// ============================================

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'more_info_needed';

export interface VerificationRequest {
  id: string;
  user_id: string;
  organizer_name: string;
  organizer_type: OrganizerType;
  organizer_description: string | null;
  proof_links: string[];
  proof_message: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: VerificationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  organizer_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: Profile;
  reviewer?: Profile;
  organizers?: Organizer;
}

// ============================================
// Festival Types
// ============================================

export type FestivalStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export interface Festival {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  start_date: string;
  end_date: string;
  cover_image_url: string | null;
  logo_url: string | null;
  location_city: string;
  location_description: string | null;
  sources: string[];
  website_url: string | null;
  facebook_url: string | null;
  hashtags: string[];
  status: FestivalStatus;
  is_featured: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: Profile;
  festival_organizers?: FestivalOrganizer[];
  festival_events?: FestivalEvent[];
}

export type FestivalOrganizerRole = 'lead' | 'organizer' | 'sponsor' | 'partner' | 'supporter';

export interface FestivalOrganizer {
  festival_id: string;
  organizer_id: string;
  role: FestivalOrganizerRole;
  sort_order: number;
  // Joined data
  organizers?: Organizer;
}

export type FestivalEventType = 'official_program' | 'community_side_event' | 'announcement_only';

export interface FestivalEvent {
  festival_id: string;
  event_id: string;
  event_type: FestivalEventType;
  is_highlighted: boolean;
  sort_order: number;
  added_at: string;
  added_by: string | null;
  // Joined data
  events?: Event;
  festivals?: Festival;
}

export type FestivalUpdateType = 'announcement' | 'schedule_change' | 'highlight' | 'reminder';

export interface FestivalUpdate {
  id: string;
  festival_id: string;
  title: string;
  body: string | null;
  image_urls: string[];
  source_url: string | null;
  update_type: FestivalUpdateType;
  is_pinned: boolean;
  created_by: string;
  posted_at: string;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: Profile;
  festivals?: Festival;
}

// ============================================
// Sponsor Types
// ============================================

export interface Sponsor {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EventSponsor {
  event_id: string;
  sponsor_id: string;
  sort_order: number;
  created_at: string;
  // Joined data
  sponsors?: Sponsor;
}

// ============================================
// Analytics Types
// ============================================

export interface TimeSeriesDataPoint {
  date: string;
  count: number;
}

export interface RoleDistribution {
  role: string;
  count: number;
  percentage: number;
}

export interface EventActivityData {
  date: string;
  created: number;
  published: number;
}

export interface RsvpTrendsData {
  date: string;
  going: number;
  waitlist: number;
  interested: number;
  cancelled: number;
}

export interface DashboardOverview {
  users: {
    total: number;
    new_today: number;
    new_this_week: number;
  };
  events: {
    total: number;
    published: number;
    draft: number;
  };
  rsvps: {
    total: number;
    going: number;
    interested: number;
  };
  organizers: {
    total: number;
    verified: number;
  };
  festivals: {
    total: number;
    active: number;
  };
  verification_queue: {
    pending: number;
  };
  notifications: {
    users_with_push: number;
  };
  sessions?: {
    total_logins: number;
    active_today: number;
    last_login_at: string | null;
  };
}

// ============================================
// Moments UGC Types
// ============================================

export type MomentContentType = 'photo' | 'video' | 'text' | 'youtube' | 'pdf' | 'audio' | 'image' | 'document';
export type MomentStatus = 'pending' | 'published' | 'rejected' | 'removed';
export type MomentVideoStatus = 'uploading' | 'processing' | 'ready' | 'error';
export type MomentsWhoCanPost = 'anyone' | 'rsvp' | 'confirmed';

export interface EventSettings {
  event_id: string;
  moments_enabled: boolean;
  moments_who_can_post: MomentsWhoCanPost;
  moments_require_approval: boolean;
  created_at: string;
  updated_at: string;
}

export interface Moment {
  id: string;
  event_id: string;
  user_id: string;
  content_type: MomentContentType;
  media_url: string | null;
  thumbnail_url: string | null;
  text_content: string | null;
  status: MomentStatus;
  moderation_note: string | null;
  source_locale: string | null;
  created_at: string;
  updated_at: string;
  // Cloudflare Stream fields (for adaptive streaming)
  cf_video_uid: string | null;
  cf_playback_url: string | null;
  video_status: MomentVideoStatus | null;
  video_duration_seconds: number | null;
  // Material type fields
  file_url: string | null;
  original_filename: string | null;
  file_size: number | null;
  mime_type: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  audio_duration_seconds: number | null;
  audio_thumbnail_url: string | null;
  track_number: string | null;
  release_year: number | null;
  genre: string | null;
  // Joined data
  profiles?: Profile;
  events?: Event;
}

export interface MomentWithProfile {
  id: string;
  event_id: string;
  user_id: string;
  content_type: MomentContentType;
  media_url: string | null;
  thumbnail_url: string | null;
  text_content: string | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  // Cloudflare Stream fields (for adaptive streaming)
  cf_video_uid: string | null;
  cf_playback_url: string | null;
  video_status: MomentVideoStatus | null;
  video_duration_seconds: number | null;
  // Material type fields
  file_url: string | null;
  original_filename: string | null;
  file_size: number | null;
  mime_type: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  audio_duration_seconds: number | null;
  audio_thumbnail_url: string | null;
  track_number: string | null;
  release_year: number | null;
  genre: string | null;
}

export interface MomentCounts {
  event_id: string;
  published_count: number;
  pending_count: number;
}

// Extended moment type with event data for the content-first feed
export interface MomentWithEvent {
  id: string;
  event_id: string;
  user_id: string;
  content_type: MomentContentType;
  media_url: string | null;
  text_content: string | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  event_slug: string;
  event_title: string;
  event_image_url: string | null;
  event_starts_at: string;
  event_location_name: string | null;
  // Cloudflare Stream fields (for adaptive streaming)
  cf_video_uid?: string | null;
  cf_playback_url?: string | null;
  video_status?: MomentVideoStatus | null;
  video_duration_seconds?: number | null;
}

// Community moment from events at a venue (via get_venue_community_moments RPC)
export interface VenueCommunityMoment {
  id: string;
  event_id: string;
  user_id: string;
  content_type: MomentContentType;
  media_url: string | null;
  text_content: string | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  event_title: string;
  event_slug: string;
  event_image_url: string | null;
}

export interface MomentLikeStatus {
  moment_id: string;
  liked: boolean;
  count: number;
}

// Grouped moment for profile timeline (subset of fields)
export interface GroupedMoment {
  id: string;
  content_type: MomentContentType;
  media_url: string | null;
  thumbnail_url: string | null;
  text_content: string | null;
  created_at: string;
  // Cloudflare Stream fields (for adaptive streaming)
  cf_video_uid?: string | null;
  cf_playback_url?: string | null;
  video_status?: MomentVideoStatus | null;
  video_duration_seconds?: number | null;
  // Material type fields (optional for backward compatibility)
  file_url?: string | null;
  youtube_url?: string | null;
  youtube_video_id?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  audio_duration_seconds?: number | null;
  audio_thumbnail_url?: string | null;
}

// Event group with its moments for profile timeline
export interface EventMomentsGroup {
  event_id: string;
  event_slug: string;
  event_title: string;
  event_starts_at: string;
  event_image_url: string | null;
  moments: GroupedMoment[];
}

// Grouped moment for discovery feed (includes user info)
export interface DiscoveryGroupedMoment {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  content_type: MomentContentType;
  media_url: string | null;
  thumbnail_url: string | null;
  text_content: string | null;
  created_at: string;
}

// Event group for discovery feed (includes location and total count)
export interface DiscoveryEventMomentsGroup {
  event_id: string;
  event_slug: string;
  event_title: string;
  event_starts_at: string;
  event_image_url: string | null;
  event_location_name: string | null;
  total_moment_count: number;
  moments: DiscoveryGroupedMoment[];
}

// ============================================
// Event Invitation Types
// ============================================

export type InvitationStatus = 'pending' | 'sent' | 'viewed' | 'responded';
export type InvitationRsvpStatus = 'going' | 'cancelled' | 'interested';

export interface EventInvitation {
  id: string;
  event_id: string;
  invited_by: string;
  email: string;
  name: string | null;
  token: string;
  status: InvitationStatus;
  rsvp_status: InvitationRsvpStatus | null;
  claimed_by: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  created_at: string;
  // Joined data
  events?: Event;
  profiles?: Profile;
  claimed_profile?: Profile;
}

export interface OrganizerContact {
  id: string;
  owner_id: string;
  email: string;
  name: string | null;
  last_invited_at: string;
  invite_count: number;
  created_at: string;
}

export interface InviteQuota {
  id: string;
  user_id: string;
  date: string;
  daily_count: number;
  weekly_count: number;
  week_start: string;
}

export interface InviteQuotaCheck {
  allowed: boolean;
  reason?: 'unauthorized' | 'daily_limit_exceeded' | 'weekly_limit_exceeded';
  remaining_daily: number;
  remaining_weekly: number;
}

export interface InvitationCounts {
  total: number;
  pending: number;
  sent: number;
  viewed: number;
  responded: number;
  going: number;
  not_going: number;
  maybe: number;
}

// ============================================
// Recurring Events Types
// ============================================

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type SeriesStatus = 'active' | 'paused' | 'cancelled';
export type ExceptionType = 'modified' | 'cancelled' | 'rescheduled';

export interface EventSeries {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  image_url: string | null;
  location_name: string | null;
  address: string | null;
  google_maps_url: string | null;
  external_chat_url: string | null;
  timezone: string;
  capacity: number | null;
  // Online event support
  is_online: boolean;
  online_link: string | null;
  // Flyer customization
  title_position: "top" | "middle" | "bottom";
  image_fit: "cover" | "contain";
  focal_point: string | null; // e.g., "50% 80%" for object-position
  // Pricing
  price_type: PriceType | null;
  ticket_tiers: TicketTier[] | null;
  tribe_id: string | null;
  organizer_id: string | null;
  created_by: string;
  rrule: string;
  starts_at_time: string;
  duration_minutes: number;
  first_occurrence: string;
  rrule_until: string | null;
  rrule_count: number | null;
  status: SeriesStatus;
  instances_generated_until: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: Profile;
  organizers?: Organizer;
  tribes?: Tribe;
}

export interface SeriesException {
  id: string;
  series_id: string;
  original_date: string;
  exception_type: ExceptionType;
  new_event_id: string | null;
  reason: string | null;
  created_at: string;
  created_by: string;
}

export interface SeriesRsvp {
  series_id: string;
  user_id: string;
  auto_rsvp: boolean;
  created_at: string;
  // Joined data
  profiles?: Profile;
}

// Recurrence form data for the UI picker
export interface RecurrenceFormData {
  isRecurring: boolean;
  frequency: RecurrenceFrequency;
  interval: number;
  weekDays: string[];  // ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
  monthDay: number | null;  // 1-31 for specific day
  monthWeekDay: {
    week: number;  // 1-5 (-1 for last)
    day: string;   // "MO", "TU", etc.
  } | null;
  endType: 'never' | 'count' | 'date';
  endCount?: number;
  endDate?: string;  // ISO date string
}

// Preset recurrence patterns for quick selection
export interface RecurrencePreset {
  id: string;
  label: string;
  rrule: string;
  description?: string;
}

// ============================================
// Live Streaming Types
// ============================================

export type LiveStreamStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'ended';
export type StreamChatMessageType = 'text' | 'system' | 'highlight';

export interface LiveStream {
  id: string;
  event_id: string;
  broadcaster_id: string;
  cf_live_input_id: string | null;
  cf_stream_key: string | null;
  cf_playback_url: string | null;
  title: string | null;
  angle_label: string;
  status: LiveStreamStatus;
  current_viewers: number;
  peak_viewers: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: Profile;
}

export interface LiveStreamWithBroadcaster {
  id: string;
  broadcaster_id: string;
  broadcaster_name: string | null;
  broadcaster_avatar: string | null;
  title: string | null;
  angle_label: string;
  status: LiveStreamStatus;
  cf_playback_url: string | null;
  current_viewers: number;
  started_at: string | null;
}

export interface StreamChatMessage {
  id: string;
  event_id: string;
  user_id: string;
  content: string;
  message_type: StreamChatMessageType;
  is_deleted: boolean;
  deleted_by: string | null;
  deleted_at: string | null;
  created_at: string;
  // Joined data
  profiles?: Profile;
}

export interface StreamChatMessageWithUser {
  id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  content: string;
  message_type: StreamChatMessageType;
  created_at: string;
}

// Cloudflare Stream API types
export interface CloudflareStreamInput {
  uid: string;
  rtmps: {
    url: string;
    streamKey: string;
  };
  rtmpsPlayback: string;
  webRTC: string;
  webRTCPlayback: string;
  srt: {
    url: string;
    streamId: string;
    passphrase: string;
  };
  status: {
    current: {
      state: 'connected' | 'disconnected';
    } | null;
  } | null;
  created: string;
  modified: string;
}

// ============================================
// Comment Types
// ============================================

export type CommentTargetType = 'event' | 'moment';

export interface Comment {
  id: string;
  target_type: CommentTargetType;
  target_id: string;
  parent_id: string | null;
  user_id: string;
  content: string;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  is_edited: boolean;
  edited_at: string | null;
  source_locale: string | null;
  reply_count: number;
  is_hidden: boolean;
  moderation_note: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: Profile;
}

export interface CommentWithProfile {
  id: string;
  parent_id: string | null;
  user_id: string;
  content: string;
  is_deleted: boolean;
  is_edited: boolean;
  edited_at: string | null;
  reply_count: number;
  source_locale: string | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface CommentCounts {
  target_type: CommentTargetType;
  target_id: string;
  total_count: number;
  top_level_count: number;
}

export interface MutedThread {
  id: string;
  user_id: string;
  thread_id: string;
  muted_at: string;
}

// ============================================
// Image Version Types (AI-generated image history)
// ============================================

export type ImageVersionContentType = 'event' | 'blog' | 'profile' | 'venue' | 'organizer';
export type ImageVersionFieldName = 'cover_image' | 'avatar' | 'logo';

export interface ImageVersion {
  id: string;
  content_type: ImageVersionContentType;
  content_id: string;
  field_name: ImageVersionFieldName;
  image_url: string;
  alt: string | null;
  description: string | null;
  keywords: string[] | null;
  colors: string[] | null;
  generation_prompt: string | null;
  created_at: string;
  created_by: string | null;
}

// ============================================
// Event Materials Types
// ============================================

export type MaterialType = 'youtube' | 'pdf' | 'audio' | 'video' | 'image' | 'document';

export interface EventMaterial {
  id: string;
  event_id: string;
  material_type: MaterialType;
  // For uploaded files
  file_url: string | null;
  original_filename: string | null;
  file_size: number | null;
  mime_type: string | null;
  // For YouTube videos
  youtube_url: string | null;
  youtube_video_id: string | null;
  // Display
  title: string | null;
  description: string | null;
  sort_order: number;
  // Audio metadata (from ID3 tags)
  artist: string | null;
  album: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  track_number: string | null;
  release_year: number | null;
  genre: string | null;
  // Metadata
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Draft material for new events (before we have an eventId)
export interface DraftMaterial {
  id: string; // temporary client-side ID
  material_type: MaterialType;
  file_url: string | null;
  original_filename: string | null;
  file_size: number | null;
  mime_type: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  title: string | null;
  // Audio metadata (from ID3 tags)
  artist: string | null;
  album: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  track_number: string | null;
  release_year: number | null;
  genre: string | null;
  pending_file?: File; // Store file for upload after event creation
  pending_thumbnail?: Blob; // Store album art for upload after event creation
}

// ============================================
// Blog Types (re-export from blog.ts)
// ============================================

export * from './blog';
