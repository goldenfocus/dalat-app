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

/**
 * The resume notice is shown once per signed-in user, and only when there is
 * something to announce. Right after sign-in the queue is still empty, so an
 * empty plan must not use up the one shot before the saved uploads load.
 */
export function resumeNoticeDue(announcedFor: string | null, userId: string | null, plan: ResumePlan | null): plan is ResumePlan {
  return !!userId && !!plan && announcedFor !== userId;
}
