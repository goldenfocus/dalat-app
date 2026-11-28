import type { JobQueue } from "./queue";
import {
  renderOutputSchema,
  type RecapRenderer,
  type RenderContext,
  type RenderJob,
} from "./renderer";

export interface RunJobDeps {
  queue: JobQueue;
  renderer: RecapRenderer;
  workerId: string;
  heartbeatIntervalMs: number;
  /** SIGTERM / SIGINT: abort the render and hand the job back. */
  shutdown: AbortSignal;
  /** Rehearsal: run the renderer but release the job instead of completing it. */
  dryRun?: boolean;
  log(message: string): void;
}

export type JobOutcome = "done" | "failed" | "released" | "lost";

/** Error text for the row: bounded, single line, never the spec or any key. */
export function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\s+/g, " ").slice(0, 500) || "unknown error";
}

/** Run one claimed job: heartbeat while rendering, then complete / fail / release. */
export async function runJob(job: RenderJob, deps: RunJobDeps): Promise<JobOutcome> {
  const { queue, renderer, workerId, log } = deps;
  const work = new AbortController();
  let lost = false;
  const onShutdown = () => work.abort();
  deps.shutdown.addEventListener("abort", onShutdown, { once: true });
  if (deps.shutdown.aborted) work.abort();

  const beat = async (phase?: "rendering" | "uploading") => {
    try {
      if (!(await queue.heartbeat(job.id, workerId, phase))) {
        lost = true;
        work.abort();
      }
    } catch (err) {
      // Transient network error: keep rendering; the lease outlives a few misses.
      log(`heartbeat error: ${errorText(err)}`);
    }
  };
  const timer = setInterval(() => void beat(), deps.heartbeatIntervalMs);
  const ctx: RenderContext = { workerId, signal: work.signal, log, setPhase: beat };

  try {
    await beat("rendering");
    if (lost) return "lost";
    const output = renderOutputSchema.parse(await renderer.render(job, ctx));
    if (lost) return "lost";
    if (deps.dryRun) {
      await queue.release(job.id, workerId);
      return "released";
    }
    if (!(await queue.complete(job.id, workerId, output))) return "lost";
    return "done";
  } catch (err) {
    if (lost) return "lost";
    if (deps.shutdown.aborted) {
      await queue.release(job.id, workerId);
      return "released";
    }
    const retryable = (err as { retryable?: unknown })?.retryable !== false;
    const status = await queue.fail(job.id, workerId, errorText(err), retryable);
    log(`job ${job.id} failed (${status ?? "not claimant"}): ${errorText(err)}`);
    return status === null ? "lost" : "failed";
  } finally {
    clearInterval(timer);
    deps.shutdown.removeEventListener("abort", onShutdown);
  }
}
