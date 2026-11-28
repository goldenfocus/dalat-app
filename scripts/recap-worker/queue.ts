import { z } from "zod";
import { renderJobSchema, type RenderJob } from "./renderer";

/** The slice of supabase-js the worker uses, so tests can fake it. */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface JobQueue {
  claim(workerId: string, kinds: string[]): Promise<RenderJob | null>;
  heartbeat(jobId: string, workerId: string, phase?: "rendering" | "uploading"): Promise<boolean>;
  complete(jobId: string, workerId: string, output: unknown): Promise<boolean>;
  fail(jobId: string, workerId: string, error: string, retryable: boolean): Promise<string | null>;
  release(jobId: string, workerId: string): Promise<boolean>;
  requeueStale(staleAfterSeconds: number): Promise<number>;
}

/** Parameterised RPC calls only; every result is Zod-validated. */
export function createQueue(client: RpcClient): JobQueue {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn} failed: ${error.message}`);
    return data;
  }
  return {
    async claim(workerId, kinds) {
      const rows = z
        .array(renderJobSchema)
        .max(1)
        .parse(await call("claim_render_job", { p_worker_id: workerId, p_kinds: kinds }));
      return rows[0] ?? null;
    },
    async heartbeat(jobId, workerId, phase) {
      const data = await call("heartbeat_render_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_status: phase ?? null,
      });
      return z.boolean().parse(data);
    },
    async complete(jobId, workerId, output) {
      const data = await call("complete_render_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_output: output,
      });
      return z.boolean().parse(data);
    },
    async fail(jobId, workerId, error, retryable) {
      const data = await call("fail_render_job", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_error: error,
        p_retryable: retryable,
      });
      return z.string().nullable().parse(data);
    },
    async release(jobId, workerId) {
      return z.boolean().parse(await call("release_render_job", { p_job_id: jobId, p_worker_id: workerId }));
    },
    async requeueStale(staleAfterSeconds) {
      const data = await call("requeue_stale_render_jobs", {
        p_stale_after: `${Math.floor(staleAfterSeconds)} seconds`,
      });
      return z.number().int().parse(data);
    },
  };
}
