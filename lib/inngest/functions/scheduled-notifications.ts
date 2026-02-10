import { inngest } from '../client';
import { createClient } from '@supabase/supabase-js';
import { notify } from '@/lib/notifications';
import type { NotificationPayload } from '@/lib/notifications/types';

/**
 * Create a service role Supabase client for accessing scheduled notifications.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * Process scheduled notifications.
 *
 * This function runs every minute and sends any notifications that are due.
 * It's designed to be idempotent - if it runs multiple times, it will only
 * send each notification once (thanks to status tracking).
 */
export const processScheduledNotifications = inngest.createFunction(
  {
    id: 'process-scheduled-notifications',
    name: 'Process Scheduled Notifications',
  },
  { cron: '* * * * *' }, // Every minute
  async ({ step }) => {
    const supabase = createServiceClient();
    if (!supabase) {
      console.error('[inngest] Supabase client not configured');
      return { processed: 0, error: 'Supabase client not configured' };
    }

    // Find pending notifications that are due
    const { data: pendingNotifications, error: fetchError } = await step.run(
      'fetch-pending-notifications',
      async () => {
        return supabase
          .from('scheduled_notifications')
          .select('*')
          .eq('status', 'pending')
          .lte('scheduled_for', new Date().toISOString())
          .limit(50); // Process in batches of 50
      }
    );

    if (fetchError) {
      console.error('[inngest] Error fetching scheduled notifications:', fetchError.message);
      return { processed: 0, error: fetchError.message };
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      return { processed: 0 };
    }

    console.log(`[inngest] Processing ${pendingNotifications.length} scheduled notification(s)`);

    let processed = 0;
    let failed = 0;

    // Process each notification
    for (const scheduled of pendingNotifications) {
      const result = await step.run(
        `send-notification-${scheduled.id}`,
        async () => {
          try {
            // Mark as processing (prevent double-send)
            await supabase
              .from('scheduled_notifications')
              .update({ status: 'processing' })
              .eq('id', scheduled.id)
              .eq('status', 'pending');

            // Send the notification
            const payload = scheduled.payload as NotificationPayload;
            const notifyResult = await notify(payload);

            // Update status based on result
            if (notifyResult.success) {
              await supabase
                .from('scheduled_notifications')
                .update({
                  status: 'sent',
                  sent_at: new Date().toISOString(),
                })
                .eq('id', scheduled.id);
              return { success: true };
            } else {
              await supabase
                .from('scheduled_notifications')
                .update({
                  status: 'failed',
                  error_message: 'Notification failed to send',
                })
                .eq('id', scheduled.id);
              return { success: false };
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            await supabase
              .from('scheduled_notifications')
              .update({
                status: 'failed',
                error_message: message,
              })
              .eq('id', scheduled.id);
            return { success: false, error: message };
          }
        }
      );

      if (result.success) {
        processed++;
      } else {
        failed++;
      }
    }

    console.log(`[inngest] Processed: ${processed}, Failed: ${failed}`);

    return { processed, failed };
  }
);

/**
 * Handle RSVP created event - schedule reminders.
 *
 * When a user RSVPs to an event, we schedule:
 * - 24h reminder (confirm attendance)
 * - 2h reminder (final reminder)
 * - Feedback request (3h after event ends)
 */
export const onRsvpCreated = inngest.createFunction(
  {
    id: 'on-rsvp-created',
    name: 'Schedule RSVP Reminders',
  },
  { event: 'rsvp/created' },
  async ({ event, step }) => {
    const {
      userId,
      locale,
      eventId,
      eventTitle,
      eventSlug,
      startsAt,
      endsAt,
      locationName,
      googleMapsUrl,
    } = event.data;

    const supabase = createServiceClient();
    if (!supabase) return { error: 'Supabase client not configured' };

    const eventStart = new Date(startsAt);
    const now = new Date();

    const eventTime = eventStart.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    const scheduled: string[] = [];

    // Cancel any stale pending reminders before re-scheduling.
    // This keeps the workflow idempotent if the same event fires multiple times
    // and also clears older "interested" reminders when a user switches to going.
    await step.run('clear-existing-rsvp-reminders', async () => {
      return supabase
        .from('scheduled_notifications')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('reference_id', eventId)
        .in('reference_type', ['event_rsvp', 'event_interested'])
        .eq('status', 'pending')
        .select('id');
    });

    // Schedule 24h reminder
    const time24hBefore = new Date(eventStart.getTime() - 24 * 60 * 60 * 1000);
    if (time24hBefore > now) {
      await step.run('schedule-24h-reminder', async () => {
        return supabase.from('scheduled_notifications').insert({
          user_id: userId,
          type: 'confirm_attendance_24h',
          scheduled_for: time24hBefore.toISOString(),
          payload: {
            type: 'confirm_attendance_24h',
            userId,
            locale,
            eventId,
            eventSlug,
            eventTitle,
            eventTime,
          },
          reference_type: 'event_rsvp',
          reference_id: eventId,
        });
      });
      scheduled.push('24h');
    }

    // Schedule 2h reminder
    const time2hBefore = new Date(eventStart.getTime() - 2 * 60 * 60 * 1000);
    if (time2hBefore > now) {
      await step.run('schedule-2h-reminder', async () => {
        return supabase.from('scheduled_notifications').insert({
          user_id: userId,
          type: 'final_reminder_2h',
          scheduled_for: time2hBefore.toISOString(),
          payload: {
            type: 'final_reminder_2h',
            userId,
            locale,
            eventId,
            eventSlug,
            eventTitle,
            locationName: locationName || 'the venue',
            googleMapsUrl,
          },
          reference_type: 'event_rsvp',
          reference_id: eventId,
        });
      });
      scheduled.push('2h');
    }

    // Schedule feedback request (3h after event ends)
    const eventEnd = endsAt
      ? new Date(endsAt)
      : new Date(eventStart.getTime() + 4 * 60 * 60 * 1000);
    const feedbackTime = new Date(eventEnd.getTime() + 3 * 60 * 60 * 1000);

    if (feedbackTime > now) {
      await step.run('schedule-feedback-request', async () => {
        return supabase.from('scheduled_notifications').insert({
          user_id: userId,
          type: 'feedback_request',
          scheduled_for: feedbackTime.toISOString(),
          payload: {
            type: 'feedback_request',
            userId,
            locale,
            eventId,
            eventSlug,
            eventTitle,
          },
          reference_type: 'event_rsvp',
          reference_id: eventId,
        });
      });
      scheduled.push('feedback');
    }

    return { scheduled };
  }
);

/**
 * Handle RSVP cancelled event - cancel scheduled reminders.
 */
export const onRsvpCancelled = inngest.createFunction(
  {
    id: 'on-rsvp-cancelled',
    name: 'Cancel RSVP Reminders',
  },
  { event: 'rsvp/cancelled' },
  async ({ event, step }) => {
    const { userId, eventId } = event.data;

    const supabase = createServiceClient();
    if (!supabase) return { error: 'Supabase client not configured' };

    const result = await step.run('cancel-scheduled-notifications', async () => {
      return supabase
        .from('scheduled_notifications')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('reference_id', eventId)
        .in('reference_type', ['event_rsvp', 'event_interested'])
        .eq('status', 'pending')
        .select('id');
    });

    const cancelled = result.data?.length || 0;
    console.log(`[inngest] Cancelled ${cancelled} scheduled notification(s) for ${eventId}/${userId}`);

    return { cancelled };
  }
);

/**
 * Handle user marking "interested" in an event - schedule lighter reminders.
 *
 * Interested users get:
 * - 24h reminder (gentle nudge to RSVP)
 * - No 2h reminder (not committed)
 * - No feedback request (didn't attend)
 */
export const onRsvpInterested = inngest.createFunction(
  {
    id: 'on-rsvp-interested',
    name: 'Schedule Interested Reminders',
  },
  { event: 'rsvp/interested' },
  async ({ event, step }) => {
    const {
      userId,
      locale,
      eventId,
      eventTitle,
      eventSlug,
      startsAt,
    } = event.data;

    const supabase = createServiceClient();
    if (!supabase) return { error: 'Supabase client not configured' };

    const eventStart = new Date(startsAt);
    const now = new Date();

    const eventTime = eventStart.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Ho_Chi_Minh',
    });

    const scheduled: string[] = [];

    // Cancel stale pending reminders before creating the interested reminder.
    await step.run('clear-existing-interested-reminders', async () => {
      return supabase
        .from('scheduled_notifications')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('reference_id', eventId)
        .in('reference_type', ['event_interested', 'event_rsvp'])
        .eq('status', 'pending')
        .select('id');
    });

    // Schedule 24h reminder only (gentle nudge)
    const time24hBefore = new Date(eventStart.getTime() - 24 * 60 * 60 * 1000);
    if (time24hBefore > now) {
      await step.run('schedule-interested-24h-reminder', async () => {
        return supabase.from('scheduled_notifications').insert({
          user_id: userId,
          type: 'event_reminder',
          scheduled_for: time24hBefore.toISOString(),
          payload: {
            type: 'event_reminder',
            userId,
            locale,
            eventId,
            eventSlug,
            eventTitle,
            eventTime,
          },
          reference_type: 'event_interested',
          reference_id: eventId,
        });
      });
      scheduled.push('24h');
    }

    return { scheduled };
  }
);
