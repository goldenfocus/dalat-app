import { isWorking, type UploadJob } from './types';

export interface ResumePlan {
  count: number;
  events: number;
  /** Set only when every resumed upload belongs to one album. */
  eventSlug?: string;
  eventTitle?: string;
}

/**
 * Uploads the previous visit left unfinished. Files live in IndexedDB, so these
 * continue on their own; this only decides what the one status toast says.
 * `openedAt` excludes anything picked during this visit.
 */
export function planResume(jobs: UploadJob[], userId: string | null, openedAt: number): ResumePlan | null {
  if (!userId) return null;
  const left = jobs.filter(job => job.userId === userId && job.durable && job.createdAt < openedAt
    && isWorking(job.phase) && job.error !== 'missing-file');
  if (!left.length) return null;
  const slugs = new Set(left.map(job => job.eventSlug));
  return { count: left.length, events: slugs.size,
    ...(slugs.size === 1 ? { eventSlug: left[0].eventSlug, eventTitle: left[0].eventTitle } : {}) };
}
