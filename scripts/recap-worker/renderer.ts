import { z } from "zod";

/** A claimed job row as the worker sees it (validated at the RPC boundary). */
export const renderJobSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  kind: z.string(),
  spec: z.unknown(),
  source_hash: z.string(),
  attempts: z.number().int(),
  max_attempts: z.number().int(),
});
export type RenderJob = z.infer<typeof renderJobSchema>;

/** What a renderer hands back; stored verbatim as render_jobs.output. */
export const renderOutputSchema = z
  .object({
    streamUid: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    durationMs: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    dryRun: z.boolean().optional(),
  })
  .refine((o) => o.streamUid || o.url, "output needs streamUid or url");
export type RenderOutput = z.infer<typeof renderOutputSchema>;

export interface RenderContext {
  workerId: string;
  /** Aborted on SIGTERM or when the claim is lost: stop work and clean up. */
  signal: AbortSignal;
  log(message: string): void;
  /** Tell the queue the job moved on (renders call "uploading" before upload). */
  setPhase(phase: "rendering" | "uploading"): Promise<void>;
}

export interface RecapRenderer {
  readonly name: string;
  render(job: RenderJob, ctx: RenderContext): Promise<RenderOutput>;
}

/** Throw from a renderer when retrying cannot help (e.g. invalid spec). */
export class NonRetryableRenderError extends Error {
  readonly retryable = false;
}

/** Validates the spec loosely and returns a fake output; touches no media. */
export const dryRunRenderer: RecapRenderer = {
  name: "dry-run",
  async render(job, ctx) {
    const spec = job.spec;
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      throw new NonRetryableRenderError("spec must be a JSON object");
    }
    const items = (spec as { items?: unknown }).items;
    if (items !== undefined && !Array.isArray(items)) {
      throw new NonRetryableRenderError("spec.items must be an array when present");
    }
    const list = Array.isArray(items) ? items : [];
    const durationMs = list.reduce<number>((sum, item) => {
      const hold = (item as { holdMs?: unknown } | null)?.holdMs;
      return sum + (typeof hold === "number" && hold > 0 ? Math.floor(hold) : 0);
    }, 0);
    ctx.log(`dry-run: spec ok, ${list.length} item(s)`);
    return { url: `dry-run://${job.id}`, durationMs, bytes: 0, dryRun: true };
  },
};

/** Production renderers register here once one exists (see README). */
export function resolveRenderer(dryRun: boolean): RecapRenderer {
  if (dryRun) return dryRunRenderer;
  throw new Error(
    "No production renderer is installed yet. Run with --dry-run, or register a RecapRenderer in resolveRenderer().",
  );
}
