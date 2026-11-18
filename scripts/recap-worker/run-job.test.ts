import { describe, expect, it, vi } from "vitest";
import { createQueue, type JobQueue } from "./queue";
import { dryRunRenderer, NonRetryableRenderError, type RecapRenderer, type RenderJob } from "./renderer";
import { runJob, type RunJobDeps } from "./run-job";
import { runWorker } from "./worker";

const job: RenderJob = {
  id: "22222222-2222-4222-8222-222222222222",
  event_id: "11111111-1111-4111-8111-111111111111",
  kind: "recap_short",
  spec: { items: [{ holdMs: 1500 }, { holdMs: 2500 }] },
  source_hash: "abcdef12",
  attempts: 1,
  max_attempts: 3,
};

function fakeQueue(over: Partial<JobQueue> = {}): JobQueue {
  return {
    claim: vi.fn().mockResolvedValue(null),
    heartbeat: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue("queued"),
    release: vi.fn().mockResolvedValue(true),
    requeueStale: vi.fn().mockResolvedValue(0),
    ...over,
  };
}

function deps(queue: JobQueue, renderer: RecapRenderer, extra: Partial<RunJobDeps> = {}): RunJobDeps {
  return {
    queue,
    renderer,
    workerId: "w1",
    heartbeatIntervalMs: 60_000,
    shutdown: new AbortController().signal,
    log: () => {},
    ...extra,
  };
}

describe("runJob", () => {
  it("completes with the renderer output", async () => {
    const queue = fakeQueue();
    expect(await runJob(job, deps(queue, dryRunRenderer))).toBe("done");
    expect(queue.heartbeat).toHaveBeenCalledWith(job.id, "w1", "rendering");
    expect(queue.complete).toHaveBeenCalledWith(
      job.id,
      "w1",
      expect.objectContaining({ durationMs: 4000, dryRun: true }),
    );
  });

  it("releases instead of completing in dry-run mode", async () => {
    const queue = fakeQueue();
    expect(await runJob(job, deps(queue, dryRunRenderer, { dryRun: true }))).toBe("released");
    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.release).toHaveBeenCalled();
  });

  it("fails retryably on a generic error and terminally on NonRetryableRenderError", async () => {
    const boom: RecapRenderer = { name: "x", render: async () => { throw new Error("ffmpeg crashed"); } };
    const queue = fakeQueue();
    expect(await runJob(job, deps(queue, boom))).toBe("failed");
    expect(queue.fail).toHaveBeenCalledWith(job.id, "w1", "ffmpeg crashed", true);

    const bad: RecapRenderer = { name: "x", render: async () => { throw new NonRetryableRenderError("bad spec"); } };
    const q2 = fakeQueue();
    await runJob(job, deps(q2, bad));
    expect(q2.fail).toHaveBeenCalledWith(job.id, "w1", "bad spec", false);
  });

  it("rejects malformed renderer output as a failure", async () => {
    const bad: RecapRenderer = { name: "x", render: async () => ({ durationMs: 1, bytes: 1 }) };
    const queue = fakeQueue();
    expect(await runJob(job, deps(queue, bad))).toBe("failed");
    expect(queue.complete).not.toHaveBeenCalled();
  });

  it("stops and does not fail when the claim is lost", async () => {
    const queue = fakeQueue({ heartbeat: vi.fn().mockResolvedValue(false) });
    expect(await runJob(job, deps(queue, dryRunRenderer))).toBe("lost");
    expect(queue.fail).not.toHaveBeenCalled();
    expect(queue.complete).not.toHaveBeenCalled();
  });

  it("releases the job when shutdown aborts a running render", async () => {
    const shutdown = new AbortController();
    const slow: RecapRenderer = {
      name: "slow",
      render: (_j, ctx) =>
        new Promise((_, reject) => {
          ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
          shutdown.abort();
        }),
    };
    const queue = fakeQueue();
    expect(await runJob(job, deps(queue, slow, { shutdown: shutdown.signal }))).toBe("released");
    expect(queue.release).toHaveBeenCalledWith(job.id, "w1");
    expect(queue.fail).not.toHaveBeenCalled();
  });
});

describe("runWorker", () => {
  it("--once: sweeps, claims one job, runs it and returns", async () => {
    const queue = fakeQueue({ claim: vi.fn().mockResolvedValue(job) });
    await runWorker({
      queue, renderer: dryRunRenderer, workerId: "w1", kinds: ["recap_short"], mode: "once",
      dryRun: false, pollIntervalMs: 1, heartbeatIntervalMs: 60_000, staleAfterSeconds: 600,
      shutdown: new AbortController().signal, log: () => {}, sleep: async () => {},
    });
    expect(queue.requeueStale).toHaveBeenCalledWith(600);
    expect(queue.claim).toHaveBeenCalledWith("w1", ["recap_short"]);
    expect(queue.complete).toHaveBeenCalledTimes(1);
  });

  it("--loop: sleeps when idle and survives a queue error", async () => {
    const stop = new AbortController();
    const claim = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(null);
    const sleep = vi.fn(async () => { if (sleep.mock.calls.length >= 2) stop.abort(); });
    await runWorker({
      queue: fakeQueue({ claim }), renderer: dryRunRenderer, workerId: "w1", kinds: ["recap_short"],
      mode: "loop", dryRun: false, pollIntervalMs: 5, heartbeatIntervalMs: 60_000, staleAfterSeconds: 600,
      shutdown: stop.signal, log: () => {}, sleep,
    });
    expect(claim).toHaveBeenCalledTimes(2);
  });
});

describe("runWorker dry run", () => {
  it("--loop --dry-run: pauses after releasing a job instead of re-claiming it at once", async () => {
    const stop = new AbortController();
    const claim = vi.fn().mockResolvedValue(job);
    const sleep = vi.fn(async () => { stop.abort(); });
    await runWorker({
      queue: fakeQueue({ claim }), renderer: dryRunRenderer, workerId: "w1", kinds: ["recap_short"],
      mode: "loop", dryRun: true, pollIntervalMs: 5, heartbeatIntervalMs: 60_000, staleAfterSeconds: 600,
      shutdown: stop.signal, log: () => {}, sleep,
    });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe("createQueue", () => {
  it("validates rows and passes only named RPC parameters", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [job], error: null });
    const claimed = await createQueue({ rpc }).claim("w1", ["recap_short"]);
    expect(claimed?.id).toBe(job.id);
    expect(rpc).toHaveBeenCalledWith("claim_render_job", { p_worker_id: "w1", p_kinds: ["recap_short"] });
  });
  it("returns null for an empty claim and throws on malformed data or errors", async () => {
    expect(await createQueue({ rpc: async () => ({ data: [], error: null }) }).claim("w", ["k_k"])).toBeNull();
    await expect(
      createQueue({ rpc: async () => ({ data: [{ id: "nope" }], error: null }) }).claim("w", ["k_k"]),
    ).rejects.toThrow();
    await expect(
      createQueue({ rpc: async () => ({ data: null, error: { message: "boom" } }) }).requeueStale(600),
    ).rejects.toThrow("boom");
  });
});
