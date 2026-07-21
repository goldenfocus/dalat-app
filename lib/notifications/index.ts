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
import { buildUnsubscribeUrl } from './unsubscribe';

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
  const { channels: forcedChannels, skipPreferences, onlyChannels } = options;

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

  if (onlyChannels) {
    enabledChannels = enabledChannels.filter((c) => onlyChannels.includes(c));
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
      const scope = payload.type === 'audience_invitation' ? 'audience' : 'all';
      sendPromises.push(
        sendEmailNotification({
          to: userEmail,
          content: template.email,
          unsubscribeUrl: buildUnsubscribeUrl(payload.userId, scope) ?? undefined,
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
  TribeInvitationPayload,
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

/**
 * Look up recipients' own locales.
 *
 * The four tribe notifications below hardcoded `locale: 'en'` since they were
 * written, so a Vietnamese member got English push notifications while the
 * event path (which does look up profiles.locale) got it right. Missing rows
 * fall back to 'en' — the same behaviour as before, just no longer the only
 * behaviour.
 */
async function getUserLocales(userIds: string[]): Promise<Map<string, Locale>> {
  const locales = new Map<string, Locale>();
  if (userIds.length === 0) return locales;

  const supabase = createServiceClient();
  if (!supabase) return locales;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, locale')
    .in('id', userIds);

  if (error) {
    console.error('[notifications] locale lookup failed:', error.message);
    return locales;
  }

  for (const row of data ?? []) {
    if (row.locale) locales.set(row.id, row.locale as Locale);
  }
  return locales;
}

export async function notifyTribeJoinRequest(
  adminIds: string[],
  requesterName: string,
  tribeName: string,
  tribeSlug: string
) {
  const locales = await getUserLocales(adminIds);
  return notifyMultiple(
    adminIds,
    (userId) => ({
      type: 'tribe_join_request',
      userId,
      locale: locales.get(userId) ?? 'en',
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
  const locales = await getUserLocales([userId]);
  const payload: TribeRequestApprovedPayload = {
    type: 'tribe_request_approved',
    userId,
    locale: locales.get(userId) ?? 'en',
    tribeName,
    tribeSlug,
  };
  return notify(payload);
}

export async function notifyTribeRequestRejected(
  userId: string,
  tribeName: string
) {
  const locales = await getUserLocales([userId]);
  const payload: TribeRequestRejectedPayload = {
    type: 'tribe_request_rejected',
    userId,
    locale: locales.get(userId) ?? 'en',
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
  const locales = await getUserLocales(memberIds);
  return notifyMultiple(
    memberIds,
    (userId) => ({
      type: 'tribe_new_event',
      userId,
      locale: locales.get(userId) ?? 'en',
      eventTitle,
      eventSlug,
      tribeName,
    })
  );
}

/**
 * Invite an existing user to a tribe — in-app + push in THEIR locale, no email.
 * The email path never comes through here; it calls sendEmailInvitation()
 * directly, exactly like event invitations do.
 */
export async function notifyTribeInvitation(
  userId: string,
  locale: Locale,
  tribeName: string,
  tribeSlug: string,
  inviterName: string,
  token: string,
  personalNote?: string | null
) {
  const payload: TribeInvitationPayload = {
    type: 'tribe_invitation',
    userId,
    locale,
    tribeName,
    tribeSlug,
    inviterName,
    token,
    personalNote: personalNote ?? null,
  };
  return notify(payload);
}
