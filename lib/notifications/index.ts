/**
 * Notification System - Main Orchestrator
 *
 * Replaces Novu with a native notification system:
 * - In-App: Supabase notifications table + Realtime
 * - Push: web-push package (existing)
 * - Email: Resend API
 *
 * Usage:
 *   import { notify } from '@/lib/notifications';
 *
 *   await notify({
 *     userId: 'user-123',
 *     locale: 'en',
 *     type: 'rsvp_confirmation',
 *     eventId: 'event-456',
 *     eventSlug: 'my-event',
 *     eventTitle: 'My Event',
 *   });
 */

import { createClient } from '@supabase/supabase-js';
import type {
  NotificationPayload,
  NotifyOptions,
  NotifyResult,
  ChannelResult,
  NotificationChannel,
} from './types';
import { getChannelsForNotification } from './preferences';
import { getNotificationTemplate } from './templates';
import { sendInAppNotification } from './channels/in-app';
import { sendPushNotification } from './channels/push';
import { sendEmailNotification } from './channels/email';

// Re-export types for convenience
export * from './types';
export { getChannelsForNotification, getDefaultChannels } from './preferences';
export { getNotificationTemplate } from './templates';

/**
 * Create a service role Supabase client.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey);
}

/**
 * Get user's email address.
 */
async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data?.user?.email) {
    return null;
  }

  return data.user.email;
}

/**
 * Main notification function.
 * Sends a notification to a user via their preferred channels.
 */
export async function notify(
  payload: NotificationPayload,
  options: NotifyOptions = {}
): Promise<NotifyResult> {
  const { channels: forcedChannels, skipPreferences } = options;

  console.log(`[notify] Starting notification: ${payload.type} for user ${payload.userId}`);

  // Get enabled channels
  let enabledChannels: NotificationChannel[];

  if (forcedChannels) {
    enabledChannels = forcedChannels;
  } else if (skipPreferences) {
    // Skip preference check - use all default channels
    enabledChannels = ['in_app', 'push'];
  } else {
    enabledChannels = await getChannelsForNotification(payload.userId, payload.type);
  }

  if (enabledChannels.length === 0) {
    console.log('[notify] No enabled channels, skipping notification');
    return { success: true, channels: [] };
  }

  console.log(`[notify] Enabled channels: ${enabledChannels.join(', ')}`);

  // Generate content from template
  const template = getNotificationTemplate(payload);

  // Send to each channel in parallel
  const results: ChannelResult[] = [];

  const sendPromises: Promise<void>[] = [];

  // In-App notification
  if (enabledChannels.includes('in_app')) {
    sendPromises.push(
      sendInAppNotification({
        userId: payload.userId,
        type: payload.type,
        content: template.inApp,
        metadata: { payload },
      }).then((result) => {
        results.push(result);
      })
    );
  }

  // Push notification
  if (enabledChannels.includes('push')) {
    sendPromises.push(
      sendPushNotification(payload.userId, template.push).then((result) => {
        results.push(result);
      })
    );
  }

  // Email notification
  if (enabledChannels.includes('email') && template.email) {
    const userEmail = await getUserEmail(payload.userId);
    if (userEmail) {
      sendPromises.push(
        sendEmailNotification({
          to: userEmail,
          content: template.email,
        }).then((result) => {
          results.push(result);
        })
      );
    } else {
      results.push({
        channel: 'email',
        success: false,
        error: 'User email not found',
      });
    }
  }

  await Promise.allSettled(sendPromises);

  const success = results.some((r) => r.success);
  const notificationId = results.find((r) => r.channel === 'in_app')?.messageId;

  console.log(`[notify] Complete: ${results.filter((r) => r.success).length}/${results.length} channels succeeded`);

  return {
    success,
    channels: results,
    notificationId,
  };
}

/**
 * Send notification to multiple users.
 * Useful for tribe notifications or organizer alerts.
 */
export async function notifyMultiple(
  userIds: string[],
  payloadGenerator: (userId: string) => NotificationPayload,
  options: NotifyOptions = {}
): Promise<{ userId: string; result: NotifyResult }[]> {
  const results = await Promise.all(
    userIds.map(async (userId) => {
      const payload = payloadGenerator(userId);
      const result = await notify(payload, options);
      return { userId, result };
    })
  );

  return results;
}

/**
 * Send email invitation to non-user (external email).
 * This bypasses the normal notification flow since there's no user account.
 */
export async function sendEmailInvitation(
  email: string,
  payload: NotificationPayload
): Promise<ChannelResult> {
  const template = getNotificationTemplate(payload);

  if (!template.email) {
    return {
      channel: 'email',
      success: false,
      error: 'No email template for this notification type',
    };
  }

  return sendEmailNotification({
    to: email,
    content: template.email,
  });
}

// ============================================
// Convenience functions matching old Novu API
// ============================================

import type {
  RsvpConfirmationPayload,
  ConfirmAttendance24hPayload,
  FinalReminder2hPayload,
  WaitlistPromotionPayload,
  EventReminderPayload,
  WaitlistPositionPayload,
  NewRsvpPayload,
  FeedbackRequestPayload,
  UserInvitationPayload,
  TribeRequestApprovedPayload,
  TribeRequestRejectedPayload,
} from './types';
import type { Locale } from '@/lib/types';

export async function notifyRsvpConfirmation(
  userId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string,
  eventDescription: string | null
) {
  const payload: RsvpConfirmationPayload = {
    type: 'rsvp_confirmation',
    userId,
    locale,
    eventId: '',
    eventSlug,
    eventTitle,
    eventDescription,
  };
  return notify(payload);
}

export async function notifyConfirmAttendance24h(
  userId: string,
  locale: Locale,
  eventTitle: string,
  eventTime: string,
  eventSlug: string
) {
  const payload: ConfirmAttendance24hPayload = {
    type: 'confirm_attendance_24h',
    userId,
    locale,
    eventId: '',
    eventSlug,
    eventTitle,
    eventTime,
  };
  return notify(payload);
}

export async function notifyFinalReminder2h(
  userId: string,
  locale: Locale,
  eventTitle: string,
  locationName: string,
  googleMapsUrl: string | null,
  eventSlug: string
) {
  const payload: FinalReminder2hPayload = {
    type: 'final_reminder_2h',
    userId,
    locale,
    eventId: '',
    eventSlug,
    eventTitle,
    locationName,
    googleMapsUrl,
  };
  return notify(payload);
}

export async function notifyWaitlistPromotion(
  userId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string
) {
  const payload: WaitlistPromotionPayload = {
    type: 'waitlist_promotion',
    userId,
    locale,
    eventId: '',
    eventSlug,
    eventTitle,
  };
  return notify(payload);
}

export async function notifyEventReminder(
  userId: string,
  locale: Locale,
  eventTitle: string,
  eventTime: string,
  eventSlug: string
) {
  const payload: EventReminderPayload = {
    type: 'event_reminder',
    userId,
    locale,
    eventId: '',
    eventSlug,
    eventTitle,
    eventTime,
  };
  return notify(payload);
}

export async function notifyWaitlistPositionUpdate(
  userId: string,
  locale: Locale,
  eventTitle: string,
  position: number,
  eventSlug: string
) {
  const payload: WaitlistPositionPayload = {
    type: 'waitlist_position',
    userId,
    locale,
    eventId: '',
    eventSlug,
    eventTitle,
    position,
  };
  return notify(payload);
}

export async function notifyOrganizerNewRsvp(
  userId: string,
  locale: Locale,
  eventTitle: string,
  attendeeName: string,
  eventSlug: string
) {
  const payload: NewRsvpPayload = {
    type: 'new_rsvp',
    userId,
    locale,
    eventId: '',
    eventSlug,
    eventTitle,
    attendeeName,
  };
  return notify(payload);
}

export async function notifyFeedbackRequest(
  userId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string
) {
  const payload: FeedbackRequestPayload = {
    type: 'feedback_request',
    userId,
    locale,
    eventId: '',
    eventSlug,
    eventTitle,
  };
  return notify(payload);
}

export async function notifyUserInvitation(
  userId: string,
  locale: Locale,
  eventTitle: string,
  eventSlug: string,
  startsAt: string,
  locationName: string | null,
  inviterName: string
) {
  const payload: UserInvitationPayload = {
    type: 'user_invitation',
    userId,
    locale,
    eventId: '',
    eventSlug,
    eventTitle,
    startsAt,
    locationName,
    inviterName,
  };
  return notify(payload);
}

export async function notifyTribeJoinRequest(
  adminIds: string[],
  requesterName: string,
  tribeName: string,
  tribeSlug: string
) {
  return notifyMultiple(
    adminIds,
    (userId) => ({
      type: 'tribe_join_request',
      userId,
      locale: 'en', // Default to English for admin notifications
      requesterName,
      tribeName,
      tribeSlug,
    })
  );
}

export async function notifyTribeRequestApproved(
  userId: string,
  tribeName: string,
  tribeSlug: string
) {
  const payload: TribeRequestApprovedPayload = {
    type: 'tribe_request_approved',
    userId,
    locale: 'en',
    tribeName,
    tribeSlug,
  };
  return notify(payload);
}

export async function notifyTribeRequestRejected(
  userId: string,
  tribeName: string
) {
  const payload: TribeRequestRejectedPayload = {
    type: 'tribe_request_rejected',
    userId,
    locale: 'en',
    tribeName,
  };
  return notify(payload, { channels: ['in_app'] }); // Only in-app for rejections
}

export async function notifyTribeNewEvent(
  memberIds: string[],
  eventTitle: string,
  eventSlug: string,
  tribeName: string
) {
  return notifyMultiple(
    memberIds,
    (userId) => ({
      type: 'tribe_new_event',
      userId,
      locale: 'en',
      eventTitle,
      eventSlug,
      tribeName,
    })
  );
}
