import { describe, expect, it } from 'vitest';
import { planResume, resumeNoticeDue } from './resume';
import type { UploadJob, UploadPhase } from './types';

const job = (id: string, phase: UploadPhase, extra: Partial<UploadJob> = {}): UploadJob => ({
  id, phase, batchId: 'b', userId: 'me', eventId: 'e', eventSlug: 'potluck', eventTitle: 'Potluck',
  name: `${id}.jpg`, size: 1, mime: 'image/jpeg', isVideo: false, createdAt: 100, progress: 0, durable: true, locale: 'en', ...extra,
});

describe('planResume', () => {
  it('counts unfinished uploads from an earlier visit and names a single album', () => {
    expect(planResume([job('1', 'queued'), job('2', 'uploading'), job('3', 'published')], 'me', 500))
      .toEqual({ count: 2, events: 1, eventSlug: 'potluck', eventTitle: 'Potluck' });
  });
  it('omits the album when several events are involved', () => {
    expect(planResume([job('1', 'queued'), job('2', 'queued', { eventSlug: 'hike' })], 'me', 500))
      .toEqual({ count: 2, events: 2 });
  });
  it('ignores files picked this visit, paused jobs, other users and files that need re-picking', () => {
    expect(planResume([job('1', 'queued', { createdAt: 900 }), job('2', 'paused'), job('3', 'queued', { userId: 'x' }),
      job('4', 'queued', { error: 'missing-file' }), job('5', 'queued', { durable: false })], 'me', 500)).toBeNull();
  });
  it('does nothing when signed out', () => { expect(planResume([job('1', 'queued')], null, 500)).toBeNull(); });
});

describe('resumeNoticeDue', () => {
  const plan = { count: 2, events: 1 };
  it('waits for the saved queue to load after sign-in instead of using up the one shot', () => {
    expect(resumeNoticeDue(null, 'me', null)).toBe(false); // queue still empty right after sign-in
    expect(resumeNoticeDue(null, 'me', plan)).toBe(true); // saved uploads arrived
  });
  it('announces once per signed-in user', () => {
    expect(resumeNoticeDue('me', 'me', plan)).toBe(false);
    expect(resumeNoticeDue('me', 'someone-else', plan)).toBe(true);
    expect(resumeNoticeDue(null, null, plan)).toBe(false);
  });
});
