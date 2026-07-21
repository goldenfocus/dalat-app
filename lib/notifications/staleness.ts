import type { Notification, NotificationType } from './types';

/**
 * Notifications that have gone stale still appear in the list — they just stop
 * counting as unread. The point is that the bell badge should only ever mean
 * "there is something here worth your attention right now". A badge that counts
 * reminders for events that already happened trains people to ignore it.
 *
 * Staleness is computed at read time rather than written to the database: it's
 * deterministic, needs no migration or sweep job, and is reversible by editing
 * the table below.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * How long each notification stays "new" after it was created.
 *
 * Types absent from this map never go stale. That's deliberate — a notification
 * about another person (a new follower, a comment, your photo becoming an event
 * cover) is just as good to discover a month later, so it waits for you.
 */
const TTL_BY_TYPE: Partial<Record<NotificationType, number>> = {
  // The event is happening right now, or just did.
  final_reminder_2h: 6 * HOUR,
  event_starting_nudge: 6 * HOUR,
  event_address_reveal: 6 * HOUR,

  // Asks about a window that has since closed.
  confirm_attendance_24h: 2 * DAY,
  confirm_attendance_7d: 8 * DAY,

  // Receipts and nudges — a week on, they're history.
  rsvp_confirmation: 7 * DAY,
  event_reminder: 7 * DAY,
  feedback_request: 7 * DAY,
  waitlist_position: 7 * DAY,
  organizer_re_ping: 7 * DAY,
  new_rsvp: 7 * DAY,
};

/**
 * Invitations carry a real ISO timestamp for when the event starts, so they can
 * be anchored to the event itself instead of guessing from age. Everything else
 * only has a pre-formatted display string like "7:30 PM" — not a real date —
 * hence the age-based table above.
 */
function eventStartsAt(notification: Notification): number | null {
  const payload = (notification.metadata as { payload?: { startsAt?: unknown } })?.payload;
  if (typeof payload?.startsAt !== 'string') return null;

  const startsAt = new Date(payload.startsAt).getTime();
  return Number.isNaN(startsAt) ? null : startsAt;
}

/** An invitation stays relevant until the event it invites you to has started. */
const INVITE_GRACE = 3 * HOUR;

/**
 * True when a notification is old enough that treating it as new would be a lie.
 * Stale notifications render in the read style and don't count toward the badge.
 */
export function isStale(notification: Notification, now: number = Date.now()): boolean {
  const startsAt = eventStartsAt(notification);
  if (startsAt !== null) {
    return now > startsAt + INVITE_GRACE;
  }

  const ttl = TTL_BY_TYPE[notification.type];
  if (ttl === undefined) return false;

  return now - new Date(notification.created_at).getTime() > ttl;
}

/**
 * Whether a notification should present as unread. Prefer this over checking
 * `notification.read` directly anywhere the user can see the result.
 */
export function isUnread(notification: Notification, now: number = Date.now()): boolean {
  return !notification.read && !isStale(notification, now);
}

/** How many notifications actually deserve the badge. */
export function countUnread(notifications: Notification[], now: number = Date.now()): number {
  return notifications.reduce((total, n) => (isUnread(n, now) ? total + 1 : total), 0);
}
