/**
 * Pure mirrors of the SQL state rules in 20261205_001_render_jobs.sql.
 * The database is authoritative; these exist for logging and tests, and a
 * test pins the values so drift from the SQL (60 s * 2^(n-1), cap 1 h) shows.
 *
 * The translation worker's RetrySchedule is not reused: it keeps per-key
 * retry state in a local JSON file with a fixed 15 min delay, whereas retry
 * state for a render job lives in the row (attempts, run_after).
 */
export type JobStatus =
  | "queued"
  | "claimed"
  | "rendering"
  | "uploading"
  | "done"
  | "failed"
  | "dead";

export const ACTIVE_STATUSES: readonly JobStatus[] = ["claimed", "rendering", "uploading"];

const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 3_600_000;

/** Delay before a job that just failed its `attempts`-th attempt may run again. */
export function retryDelayMs(attempts: number): number {
  const n = Math.max(Math.floor(attempts) - 1, 0);
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** n);
}

/** Where a failed active job goes next. */
export function statusAfterFailure(job: {
  attempts: number;
  maxAttempts: number;
  retryable: boolean;
}): "queued" | "failed" | "dead" {
  if (!job.retryable) return "failed";
  return job.attempts >= job.maxAttempts ? "dead" : "queued";
}

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["claimed"],
  claimed: ["rendering", "uploading", "done", "queued", "failed", "dead"],
  rendering: ["uploading", "done", "queued", "failed", "dead"],
  uploading: ["done", "queued", "failed", "dead"],
  done: [],
  failed: [],
  dead: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
