import type { Locale } from '@/lib/types';

// ============================================
// Notification Types
// ============================================

export type NotificationType =
  | 'rsvp_confirmation'
  | 'confirm_attendance_24h'
  | 'final_reminder_2h'
  | 'waitlist_promotion'
  | 'event_reminder'
  | 'waitlist_position'
  | 'new_rsvp'
  | 'feedback_request'
  | 'event_invitation'
  | 'user_invitation'
  | 'tribe_join_request'
  | 'tribe_request_approved'
  | 'tribe_request_rejected'
  | 'tribe_new_event'
  // Comment notifications
  | 'comment_on_event'
  | 'comment_on_moment'
  | 'reply_to_comment'
  | 'thread_activity';

export type NotificationChannel = 'in_app' | 'push' | 'email';

// ============================================
// Notification Content
// ============================================

export interface NotificationContent {
  title: string;
  body: string;
  primaryActionUrl?: string;
  primaryActionLabel?: string;
  secondaryActionUrl?: string;
  secondaryActionLabel?: string;
}

export interface EmailNotificationContent extends NotificationContent {
  subject: string;
  html?: string;
  replyTo?: string;
}

export interface PushNotificationContent extends NotificationContent {
  tag?: string;
  requireInteraction?: boolean;
  badge?: number;
  actions?: Array<{
    action: string;
    title: string;
    url?: string;
  }>;
}

// ============================================
// Database Models
// ============================================

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  primary_action_url: string | null;
  primary_action_label: string | null;
  secondary_action_url: string | null;
  secondary_action_label: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  read_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  channel_preferences: Record<NotificationType, NotificationChannel[]>;
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  email_digest: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  scheduled_for: string;
  payload: NotificationPayload;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  sent_at: string | null;
  error_message: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Notification Payloads (for templates)
// ============================================

export interface BaseNotificationPayload {
  userId: string;
  locale: Locale;
  type: NotificationType;
}

export interface EventNotificationPayload extends BaseNotificationPayload {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventDescription?: string | null;
  eventTime?: string;
  locationName?: string | null;
  googleMapsUrl?: string | null;
}

export interface RsvpConfirmationPayload extends EventNotificationPayload {
  type: 'rsvp_confirmation';
}

export interface ConfirmAttendance24hPayload extends EventNotificationPayload {
  type: 'confirm_attendance_24h';
  eventTime: string;
}

export interface FinalReminder2hPayload extends EventNotificationPayload {
  type: 'final_reminder_2h';
  locationName: string;
}

export interface WaitlistPromotionPayload extends EventNotificationPayload {
  type: 'waitlist_promotion';
}

export interface EventReminderPayload extends EventNotificationPayload {
  type: 'event_reminder';
  eventTime: string;
}

export interface WaitlistPositionPayload extends EventNotificationPayload {
  type: 'waitlist_position';
  position: number;
}

export interface NewRsvpPayload extends EventNotificationPayload {
  type: 'new_rsvp';
  attendeeName: string;
}

export interface FeedbackRequestPayload extends EventNotificationPayload {
  type: 'feedback_request';
}

export interface EventInvitationPayload extends BaseNotificationPayload {
  type: 'event_invitation';
  inviteeEmail: string;
  inviteeName: string | null;
  eventTitle: string;
  eventSlug: string;
  eventDescription: string | null;
  startsAt: string;
  locationName: string | null;
  inviterName: string;
  token: string;
}

export interface UserInvitationPayload extends EventNotificationPayload {
  type: 'user_invitation';
  inviterName: string;
  startsAt: string;
}

export interface TribeJoinRequestPayload extends BaseNotificationPayload {
  type: 'tribe_join_request';
  requesterName: string;
  tribeName: string;
  tribeSlug: string;
}

export interface TribeRequestApprovedPayload extends BaseNotificationPayload {
  type: 'tribe_request_approved';
  tribeName: string;
  tribeSlug: string;
}

export interface TribeRequestRejectedPayload extends BaseNotificationPayload {
  type: 'tribe_request_rejected';
  tribeName: string;
}

export interface TribeNewEventPayload extends BaseNotificationPayload {
  type: 'tribe_new_event';
  eventTitle: string;
  eventSlug: string;
  tribeName: string;
}

// ============================================
// Comment Notification Payloads
// ============================================

export type CommentTargetType = 'event' | 'moment';

export interface CommentOnEventPayload extends BaseNotificationPayload {
  type: 'comment_on_event';
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  commentId: string;
  commenterName: string;
  commentPreview: string;
}

export interface CommentOnMomentPayload extends BaseNotificationPayload {
  type: 'comment_on_moment';
  momentId: string;
  eventSlug: string;
  commenterName: string;
  commentPreview: string;
}

export interface ReplyToCommentPayload extends BaseNotificationPayload {
  type: 'reply_to_comment';
  contentType: CommentTargetType;
  contentId: string;
  eventSlug: string;
  commentId: string;
  parentCommentId: string;
  replierName: string;
  commentPreview: string;
}

export interface ThreadActivityPayload extends BaseNotificationPayload {
  type: 'thread_activity';
  contentType: CommentTargetType;
  contentId: string;
  eventSlug: string;
  contentTitle: string;
  threadId: string;
  activityCount: number;
}

export type NotificationPayload =
  | RsvpConfirmationPayload
  | ConfirmAttendance24hPayload
  | FinalReminder2hPayload
  | WaitlistPromotionPayload
  | EventReminderPayload
  | WaitlistPositionPayload
  | NewRsvpPayload
  | FeedbackRequestPayload
  | EventInvitationPayload
  | UserInvitationPayload
  | TribeJoinRequestPayload
  | TribeRequestApprovedPayload
  | TribeRequestRejectedPayload
  | TribeNewEventPayload
  // Comment notifications
  | CommentOnEventPayload
  | CommentOnMomentPayload
  | ReplyToCommentPayload
  | ThreadActivityPayload;

// ============================================
// Notify Options
// ============================================

export interface NotifyOptions {
  // Override default channels for this notification
  channels?: NotificationChannel[];
  // Skip preference check (for critical notifications)
  skipPreferences?: boolean;
  // Schedule for later
  scheduledFor?: Date;
  // Reference for cancellation
  reference?: {
    type: string;
    id: string;
  };
}

// ============================================
// Channel Results
// ============================================

export interface ChannelResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
  messageId?: string;
}

export interface NotifyResult {
  success: boolean;
  channels: ChannelResult[];
  notificationId?: string;
  scheduledId?: string;
}
