export type Locale = 'en' | 'fr' | 'vi';

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
  avatar_url: string | null;
  locale: Locale;
  role: UserRole;
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

export interface Tribe {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  slug: string;
  previous_slugs: string[];
  tribe_id: string | null;
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
  // Joined data
  profiles?: Profile;
  tribes?: Tribe;
  organizers?: Organizer;
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

// AI Extraction types
export interface ExtractedEventData {
  title: string;
  description: string | null;
  starts_at: string;  // ISO string
  ends_at: string | null;
  location_name: string | null;
  address: string | null;
  confidence: number;  // 0-1, how confident AI is about extraction
  // Deduplication results (filled in after checking)
  duplicate_of?: string;  // Event ID if duplicate found
  duplicate_confidence?: number;
}

export interface ExtractionLog {
  id: string;
  user_id: string;
  image_url: string;
  organizer_id: string | null;
  extracted_count: number;
  published_count: number;
  skipped_count: number;
  raw_response: ExtractedEventData[] | null;
  status: 'pending' | 'reviewed' | 'completed';
  created_at: string;
  // Joined data
  profiles?: Profile;
  organizers?: Organizer;
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

export interface MomentLikeStatus {
  moment_id: string;
  liked: boolean;
  count: number;
}
