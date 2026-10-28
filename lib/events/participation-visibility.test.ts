import { describe, expect, it } from 'vitest';
import { eventParticipationVisibility } from './participation-visibility';

describe('progressive event actions', () => {
  const base = { isLoggedIn: true, isPast: false, canManageEvent: false };
  it('keeps guest and unconfirmed journeys focused on joining', () => {
    for (const rsvpStatus of [null, 'interested', 'waitlist']) {
      expect(eventParticipationVisibility({ ...base, rsvpStatus })).toEqual({ arrival: false, preorder: false });
    }
    expect(eventParticipationVisibility({ ...base, isLoggedIn: false, rsvpStatus: 'going' })).toEqual({ arrival: false, preorder: false });
  });
  it('unlocks arrival and food after a confirmed RSVP', () => {
    expect(eventParticipationVisibility({ ...base, rsvpStatus: 'going' })).toEqual({ arrival: true, preorder: true });
  });
  it('allows hosts to access arrival without requiring them to RSVP', () => {
    expect(eventParticipationVisibility({ ...base, canManageEvent: true })).toEqual({ arrival: true, preorder: false });
  });
  it('removes arrival and ordering after the event ends', () => {
    expect(eventParticipationVisibility({ ...base, isPast: true, rsvpStatus: 'going', canManageEvent: true })).toEqual({ arrival: false, preorder: false });
  });
});
