// The Global Twelve - unified locale system for UI and content
export type Locale = 'en' | 'vi' | 'ko' | 'zh' | 'ru' | 'fr' | 'ja' | 'ms' | 'th' | 'de' | 'es' | 'id';

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
  ru: 'Русский', fr: 'Français', ja: '日本語', ms: 'Bahasa Melayu',
  th: 'ไทย', de: 'Deutsch', es: 'Español', id: 'Indonesia'
};

// Translation types
export type TranslationStatus = 'auto' | 'reviewed' | 'edited';
export type TranslationContentType = 'event' | 'moment' | 'profile';
export type TranslationFieldName = 'title' | 'description' | 'text_content' | 'bio';

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
  | 'admin'
  | 'moderator'
  | 'organizer_verified'
  | 'organizer_pending'
  | 'contributor';

// Role hierarchy levels (higher = more permissions)
export const ROLE_HIERARCHY: Record<UserRole, number> = {
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

export interface Event {
  id: string;
  slug: string;
  previous_slugs: string[];
  tribe_id: string | null;
  tribe_visibility: TribeEventVisibility;
  organizer_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  location_name: string | null;
  address: string | null;
  google_maps_url: string | null;
  external_chat_url: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  capacity: number | null;
  status: "draft" | "published" | "cancelled";
  created_by: string;
  created_at: string;
  updated_at: string;
  // Translation tracking
  source_locale: string | null;
  // Series fields (for recurring event instances)
  series_id: string | null;
  series_instance_date: string | null;
  is_exception: boolean;
  exception_type: "modified" | "cancelled" | "rescheduled" | null;
  // Joined data
  profiles?: Profile;
  tribes?: Tribe;
  organizers?: Organizer;
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

export type MomentContentType = 'photo' | 'video' | 'text';
export type MomentStatus = 'pending' | 'published' | 'rejected' | 'removed';
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
  text_content: string | null;
  status: MomentStatus;
  moderation_note: string | null;
  source_locale: string | null;
  created_at: string;
  updated_at: string;
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
  text_content: string | null;
  created_at: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
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
}

export interface MomentLikeStatus {
  moment_id: string;
  liked: boolean;
  count: number;
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
