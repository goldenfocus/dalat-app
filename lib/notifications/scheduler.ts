import { createClient } from '@supabase/supabase-js';
import type { Locale } from '@/lib/types';

/**
 * Reminder scheduling — writes rows into scheduled_notifications, which the
 * /api/cron/process-notifications cron delivers when due.
 *
 * These were previously Inngest event handlers (rsvp/created, rsvp/cancelled,
 * rsvp/interested) but Inngest never delivered in production, so the
 * scheduling now happens inline in the API routes that used to emit events.
 */

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

/**
 * Insert one scheduled_notifications row, surfacing (not swallowing) errors.
 * supabase-js does NOT throw on failure — an unchecked insert error means a
 * reminder that silently never fires.
 */
async function insertScheduled(
  supabase: ServiceClient,
  label: string,
  row: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase.from('scheduled_notifications').insert(row);
  if (error) {
    console.error(
      `[scheduler] FAILED to schedule ${label} (user ${row.user_id}, event ${row.reference_id}):`,
      error.message
    );
    return false;
  }
  return true;
}

/**
 * Default reminder config — used when no per-event config exists.
 */
const DEFAULT_REMINDER_CONFIG = {
  reminder_7d: true,
  reminder_24h: true,
  reminder_2h: true,
  starting_nudge: true,
  feedback: true,
  feedback_delay_hours: 3,
};

export interface RsvpReminderParams {
  userId: string;
  locale: Locale;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  startsAt: string;
  endsAt?: string | null;
  locationName?: string | null;
  googleMapsUrl?: string | null;
}

/**
 * Schedule the full reminder cascade for a "going" RSVP.
 *
 * Up to 5 reminders:
 * 1. 7 days before     → confirm_attendance_7d  (if >7d away)
 * 2. 24 hours before   → confirm_attendance_24h
 * 3. 2 hours before    → final_reminder_2h
 * 4. 15 min after start → event_starting_nudge (skipped at send time if confirmed)
 * 5. N hours after end  → feedback_request
 *
 * Each reminder is gated by per-event config (defaults to all enabled).
 */
export async function scheduleRsvpReminders(params: RsvpReminderParams): Promise<string[]> {
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
  } = params;

  const supabase = createServiceClient();
  if (!supabase) throw new Error('Supabase service client not configured');

  const eventStart = new Date(startsAt);
  const now = new Date();

  const eventTime = eventStart.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  // Day of week for the 7d reminder (e.g. "Saturday")
  const eventDayOfWeek = eventStart.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  const scheduled: string[] = [];

  // Fetch per-event reminder config (use defaults if none)
  const { data: configRow } = await supabase
    .from('event_reminder_config')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();
  const config = configRow || DEFAULT_REMINDER_CONFIG;

  // Cancel any stale pending reminders before re-scheduling.
  // This keeps scheduling idempotent if the same RSVP fires multiple times
  // and also clears older "interested" reminders when a user switches to going.
  const { error: clearError } = await supabase
    .from('scheduled_notifications')
    .update({ status: 'cancelled' })
    .eq('user_id', userId)
    .eq('reference_id', eventId)
    .in('reference_type', ['event_rsvp', 'event_interested'])
    .eq('status', 'pending');
  if (clearError) {
    console.error(`[scheduler] Failed to clear stale reminders (user ${userId}, event ${eventId}):`, clearError.message);
  }

  // 1. 7d reminder
  if (config.reminder_7d) {
    const time7dBefore = new Date(eventStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (time7dBefore > now) {
      const ok = await insertScheduled(supabase, '7d reminder', {
        user_id: userId,
        type: 'confirm_attendance_7d',
        scheduled_for: time7dBefore.toISOString(),
        payload: {
          type: 'confirm_attendance_7d',
          userId,
          locale,
          eventId,
          eventSlug,
          eventTitle,
          eventTime,
          eventDayOfWeek,
        },
        reference_type: 'event_rsvp',
        reference_id: eventId,
      });
      if (ok) scheduled.push('7d');
    }
  }

  // 2. 24h reminder
  if (config.reminder_24h) {
    const time24hBefore = new Date(eventStart.getTime() - 24 * 60 * 60 * 1000);
    if (time24hBefore > now) {
      const ok = await insertScheduled(supabase, '24h reminder', {
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
      if (ok) scheduled.push('24h');
    }
  }

  // 3. 2h reminder
  if (config.reminder_2h) {
    const time2hBefore = new Date(eventStart.getTime() - 2 * 60 * 60 * 1000);
    if (time2hBefore > now) {
      const ok = await insertScheduled(supabase, '2h reminder', {
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
      if (ok) scheduled.push('2h');
    }
  }

  // 4. Starting nudge (15 min after event start).
  // The delivery cron checks confirmed_at before sending — confirmed
  // attendees won't be nagged.
  if (config.starting_nudge) {
    const nudgeTime = new Date(eventStart.getTime() + 15 * 60 * 1000);
    if (nudgeTime > now) {
      const ok = await insertScheduled(supabase, 'starting nudge', {
        user_id: userId,
        type: 'event_starting_nudge',
        scheduled_for: nudgeTime.toISOString(),
        payload: {
          type: 'event_starting_nudge',
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
      if (ok) scheduled.push('starting_nudge');
    }
  }

  // 5. Feedback request (N hours after event ends)
  if (config.feedback) {
    const feedbackDelay = (config.feedback_delay_hours || 3) * 60 * 60 * 1000;
    const eventEnd = endsAt
      ? new Date(endsAt)
      : new Date(eventStart.getTime() + 4 * 60 * 60 * 1000);
    const feedbackTime = new Date(eventEnd.getTime() + feedbackDelay);

    if (feedbackTime > now) {
      const ok = await insertScheduled(supabase, 'feedback request', {
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
      if (ok) scheduled.push('feedback');
    }
  }

  return scheduled;
}

export interface InterestedReminderParams {
  userId: string;
  locale: Locale;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  startsAt: string;
}

/**
 * Schedule the lighter reminder for an "interested" user:
 * a single 24h nudge to actually RSVP. No 2h reminder, no feedback ask.
 */
export async function scheduleInterestedReminder(
  params: InterestedReminderParams
): Promise<string[]> {
  const { userId, locale, eventId, eventTitle, eventSlug, startsAt } = params;

  const supabase = createServiceClient();
  if (!supabase) throw new Error('Supabase service client not configured');

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
  const { error: clearError } = await supabase
    .from('scheduled_notifications')
    .update({ status: 'cancelled' })
    .eq('user_id', userId)
    .eq('reference_id', eventId)
    .in('reference_type', ['event_interested', 'event_rsvp'])
    .eq('status', 'pending');
  if (clearError) {
    console.error(`[scheduler] Failed to clear stale reminders (user ${userId}, event ${eventId}):`, clearError.message);
  }

  const time24hBefore = new Date(eventStart.getTime() - 24 * 60 * 60 * 1000);
  if (time24hBefore > now) {
    const ok = await insertScheduled(supabase, 'interested 24h reminder', {
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
    if (ok) scheduled.push('24h');
  }

  return scheduled;
}

/**
 * Cancel all pending scheduled reminders for a user/event pair
 * (called when an RSVP is cancelled).
 */
export async function cancelRsvpReminders(userId: string, eventId: string): Promise<number> {
  const supabase = createServiceClient();
  if (!supabase) throw new Error('Supabase service client not configured');

  const { data, error } = await supabase
    .from('scheduled_notifications')
    .update({ status: 'cancelled' })
    .eq('user_id', userId)
    .eq('reference_id', eventId)
    .in('reference_type', ['event_rsvp', 'event_interested'])
    .eq('status', 'pending')
    .select('id');

  if (error) {
    // Don't throw: the caller still needs to run waitlist promotion. Worst
    // case the user keeps a stale reminder; the log makes that traceable.
    console.error(`[scheduler] Failed to cancel reminders (user ${userId}, event ${eventId}):`, error.message);
    return 0;
  }

  return data?.length || 0;
}
