import { describe, expect, it } from 'vitest';
import type { Notification, NotificationType } from './types';
import { countUnread, isStale, isUnread } from './staleness';

const NOW = new Date('2026-07-20T12:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeNotification(
  type: NotificationType,
  ageMs: number,
  metadata: Record<string, unknown> = {}
): Notification {
  return {
    id: `n-${type}-${ageMs}`,
    user_id: 'u1',
    type,
    title: 'title',
    body: null,
    primary_action_url: null,
    primary_action_label: null,
    secondary_action_url: null,
    secondary_action_label: null,
    metadata,
    read: false,
    read_at: null,
    archived: false,
    created_at: new Date(NOW - ageMs).toISOString(),
    updated_at: new Date(NOW - ageMs).toISOString(),
  };
}

describe('isStale', () => {
  it('keeps a reminder fresh while the event is still happening', () => {
    expect(isStale(makeNotification('final_reminder_2h', 2 * HOUR), NOW)).toBe(false);
  });

  it('goes stale once the event is hours behind us', () => {
    expect(isStale(makeNotification('final_reminder_2h', 8 * HOUR), NOW)).toBe(true);
    expect(isStale(makeNotification('event_starting_nudge', 8 * HOUR), NOW)).toBe(true);
    expect(isStale(makeNotification('event_address_reveal', 8 * HOUR), NOW)).toBe(true);
  });

  it('gives receipts and asks a week before retiring them', () => {
    expect(isStale(makeNotification('rsvp_confirmation', 6 * DAY), NOW)).toBe(false);
    expect(isStale(makeNotification('rsvp_confirmation', 8 * DAY), NOW)).toBe(true);
    expect(isStale(makeNotification('feedback_request', 8 * DAY), NOW)).toBe(true);
  });

  it('outlives the window each attendance check is asking about', () => {
    expect(isStale(makeNotification('confirm_attendance_24h', 1 * DAY), NOW)).toBe(false);
    expect(isStale(makeNotification('confirm_attendance_24h', 3 * DAY), NOW)).toBe(true);
    expect(isStale(makeNotification('confirm_attendance_7d', 7 * DAY), NOW)).toBe(false);
    expect(isStale(makeNotification('confirm_attendance_7d', 9 * DAY), NOW)).toBe(true);
  });

  it('never retires good news, however old', () => {
    const evergreen: NotificationType[] = [
      'new_follower',
      'waitlist_promotion',
      'comment_on_event',
      'reply_to_comment',
      'video_ready',
      'tribe_request_approved',
    ];
    for (const type of evergreen) {
      expect(isStale(makeNotification(type, 400 * DAY), NOW)).toBe(false);
    }
  });

  it('treats an unknown type as evergreen rather than guessing', () => {
    // photo_featured exists in the DB enum but not the TS union
    const unknown = makeNotification('photo_featured' as NotificationType, 400 * DAY);
    expect(isStale(unknown, NOW)).toBe(false);
  });

  describe('invitations anchor to the real event time', () => {
    const invitedTo = (startsAt: string, ageMs = 1 * DAY) =>
      makeNotification('event_invitation', ageMs, { payload: { startsAt } });

    it('stays fresh for an event still to come', () => {
      expect(isStale(invitedTo('2026-08-20T12:00:00Z'), NOW)).toBe(false);
    });

    it('survives the event running long', () => {
      expect(isStale(invitedTo('2026-07-20T10:00:00Z'), NOW)).toBe(false);
    });

    it('goes stale once the event is well past', () => {
      // the reported case: invited to tomorrow's event, opened a month later
      expect(isStale(invitedTo('2026-06-20T12:00:00Z', 31 * DAY), NOW)).toBe(true);
    });

    it('falls back to age when startsAt is missing or unparseable', () => {
      const noStart = makeNotification('event_invitation', 400 * DAY, { payload: {} });
      expect(isStale(noStart, NOW)).toBe(false); // no TTL for invitations

      const garbage = makeNotification('event_invitation', 400 * DAY, {
        payload: { startsAt: '7:30 PM' },
      });
      expect(isStale(garbage, NOW)).toBe(false);
    });
  });
});

describe('isUnread', () => {
  it('is false for anything already read, stale or not', () => {
    const read = { ...makeNotification('new_follower', 1 * HOUR), read: true };
    expect(isUnread(read, NOW)).toBe(false);
  });

  it('is false for a stale notification that was never opened', () => {
    expect(isUnread(makeNotification('final_reminder_2h', 3 * DAY), NOW)).toBe(false);
  });

  it('is true for a fresh unopened notification', () => {
    expect(isUnread(makeNotification('final_reminder_2h', 1 * HOUR), NOW)).toBe(true);
  });
});

describe('countUnread', () => {
  it('counts only what still deserves attention', () => {
    const notifications = [
      makeNotification('final_reminder_2h', 1 * HOUR), // fresh   -> counts
      makeNotification('final_reminder_2h', 30 * DAY), // stale   -> ignored
      makeNotification('rsvp_confirmation', 30 * DAY), // stale   -> ignored
      makeNotification('new_follower', 30 * DAY), // evergreen -> counts
      { ...makeNotification('new_follower', 1 * HOUR), read: true }, // read -> ignored
    ];
    expect(countUnread(notifications, NOW)).toBe(2);
  });

  it('is zero for an empty list', () => {
    expect(countUnread([], NOW)).toBe(0);
  });
});
