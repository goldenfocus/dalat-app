import { describe, expect, it } from 'vitest';
import { UploadNoticeTracker } from './notices';
import type { UploadJob, UploadPhase } from './types';

const job = (id: string, phase: UploadPhase, batchId = 'batch'): UploadJob => ({
  id, phase, batchId, userId: 'user', eventId: 'event', eventSlug: 'potluck', eventTitle: 'Potluck',
  name: `${id}.mp4`, size: 123, mime: 'video/mp4', isVideo: true,
  createdAt: 1, progress: 0, durable: true, locale: 'en',
});

describe('upload notices', () => {
  it('stays quiet during transfer and waits for encoding before declaring videos ready', () => {
    const tracker = new UploadNoticeTracker();
    expect(tracker.update([job('1', 'uploading')], 0)).toEqual([]);
    expect(tracker.update([job('1', 'processing')], 0)).toMatchObject([{ phase: 'processing', processing: 1 }]);
    expect(tracker.update([job('1', 'processing')], 0)).toEqual([]);
    expect(tracker.update([job('1', 'published')], 0)).toMatchObject([{ phase: 'complete' }]);
    expect(tracker.update([job('1', 'published')], 0)).toEqual([]);
  });

  it('does not replay old completed batches after reload or route remount', () => {
    const jobs = [job('1', 'published'), job('2', 'duplicate')];
    expect(new UploadNoticeTracker().update(jobs, 0)).toEqual([]);
    expect(new UploadNoticeTracker().update(jobs, 0)).toEqual([]);
  });

  it('reports a restored processing batch once it actually finishes', () => {
    const tracker = new UploadNoticeTracker();
    expect(tracker.update([job('1', 'processing')], 0)).toEqual([]);
    expect(tracker.update([job('1', 'published')], 0)).toMatchObject([{ phase: 'complete' }]);
  });

  it('does not call 21 of 22 complete, and gives one recoverable error notice', () => {
    const tracker = new UploadNoticeTracker();
    const done = Array.from({ length: 21 }, (_, i) => job(String(i), 'published'));
    expect(tracker.update([...done, job('22', 'uploading')], 0)).toEqual([]);
    expect(tracker.update([...done, job('22', 'error')], 0)).toMatchObject([{ phase: 'error' }]);
    expect(tracker.update([...done, job('22', 'error')], 0)).toEqual([]);
    expect(tracker.update([...done, job('22', 'uploading')], 0)).toEqual([]);
    expect(tracker.update([...done, job('22', 'published')], 0)).toMatchObject([{ phase: 'complete' }]);
  });

  it('waits for file staging, keeps approval distinct, and handles separate batches', () => {
    const tracker = new UploadNoticeTracker();
    expect(tracker.update([job('1', 'published')], 1)).toEqual([]);
    expect(tracker.update([job('1', 'pending'), job('2', 'queued', 'batch-2')], 0)).toMatchObject([{ phase: 'pending', id: 'batch' }]);
    expect(tracker.update([job('1', 'pending'), job('2', 'published', 'batch-2')], 0)).toMatchObject([{ phase: 'complete', id: 'batch-2' }]);
  });

  it('does not replay a completed batch while selecting new files for another batch', () => {
    const tracker = new UploadNoticeTracker();
    const old = job('old', 'published', 'old-batch');
    expect(tracker.update([old], 0)).toEqual([]);
    expect(tracker.update([old, job('new', 'queued')], 1)).toEqual([]);
    expect(tracker.update([old, job('new', 'uploading')], 0)).toEqual([]);
    expect(tracker.update([old, job('new', 'published')], 0)).toMatchObject([{ id: 'batch', phase: 'complete' }]);
  });
});
