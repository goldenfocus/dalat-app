import { isWorking, type UploadJob } from './types';

type BatchPhase = 'working' | 'processing' | 'complete' | 'pending' | 'error' | 'paused';
export interface UploadNotice {
  id: string;
  phase: Exclude<BatchPhase, 'working'>;
  eventSlug: string;
  eventTitle: string;
  processing: number;
}

/** Observe transitions, never replay old successful receipts after a reload. */
export class UploadNoticeTracker {
  private phases = new Map<string, BatchPhase>();

  update(jobs: UploadJob[], staging: number): UploadNotice[] {
    const batches = new Map<string, UploadJob[]>();
    for (const job of jobs) {
      const batch = batches.get(job.batchId) ?? [];
      batch.push(job);
      batches.set(job.batchId, batch);
    }
    const notices: UploadNotice[] = [];
    for (const [id, batch] of batches) {
      const previous = this.phases.get(id);
      const processing = batch.filter(job => job.phase === 'processing').length;
      const stagingBatch = staging > 0 && (previous === undefined || previous === 'working');
      const phase: BatchPhase = stagingBatch || batch.some(job => isWorking(job.phase)) ? 'working'
        : batch.some(job => job.phase === 'error') ? 'error'
        : batch.some(job => job.phase === 'paused') ? 'paused'
        : processing ? 'processing'
        : batch.some(job => job.phase === 'pending') ? 'pending' : 'complete';
      this.phases.set(id, phase);
      if (phase === 'working' || phase === previous) continue;
      if (previous === undefined && phase !== 'error' && phase !== 'paused') continue;
      notices.push({ id, phase, eventSlug: batch[0].eventSlug, eventTitle: batch[0].eventTitle, processing });
    }
    for (const id of this.phases.keys()) if (!batches.has(id)) this.phases.delete(id);
    return notices;
  }
}
