import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseArgs, parseConfig } from "./config";
import { createQueue, type JobQueue, type RpcClient } from "./queue";
import { resolveRenderer, type RecapRenderer } from "./renderer";
import { runJob } from "./run-job";

export interface LoopDeps {
  queue: JobQueue;
  renderer: RecapRenderer;
  workerId: string;
  kinds: string[];
  mode: "once" | "loop";
  dryRun: boolean;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  staleAfterSeconds: number;
  shutdown: AbortSignal;
  log(message: string): void;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

/** Claim, run, repeat. One job at a time; returns when stopped (or after one pass in --once). */
export async function runWorker(deps: LoopDeps): Promise<void> {
  const { queue, log } = deps;
  while (!deps.shutdown.aborted) {
    let idle = false;
    try {
      const swept = await queue.requeueStale(deps.staleAfterSeconds);
      if (swept > 0) log(`requeued ${swept} stale job(s)`);
      const job = await queue.claim(deps.workerId, deps.kinds);
      if (job) {
        log(`claimed ${job.kind} job ${job.id} (attempt ${job.attempts}/${job.max_attempts})`);
        const outcome = await runJob(job, { ...deps });
        log(`job ${job.id} ${outcome}`);
      } else idle = true;
    } catch (err) {
      if (deps.mode === "once") throw err;
      log(`worker error: ${err instanceof Error ? err.message : String(err)}`);
      idle = true;
    }
    if (deps.mode === "once") return;
    if (idle) await deps.sleep(deps.pollIntervalMs, deps.shutdown);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

async function main() {
  loadEnv({ path: ".env.local", quiet: true });
  const options = parseArgs(process.argv.slice(2));
  const cfg = parseConfig(process.env);
  const renderer = resolveRenderer(options.dryRun);
  const client = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const shutdown = new AbortController();
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => shutdown.abort());
  const log = (m: string) => console.log(`${new Date().toISOString()} [recap-worker] ${m}`);
  log(`start worker=${cfg.workerId} mode=${options.mode} renderer=${renderer.name} kinds=${options.kinds.join(",")}`);
  await runWorker({
    queue: createQueue(client as unknown as RpcClient),
    renderer,
    workerId: cfg.workerId,
    kinds: options.kinds,
    mode: options.mode,
    dryRun: options.dryRun,
    pollIntervalMs: cfg.pollIntervalMs,
    heartbeatIntervalMs: cfg.heartbeatIntervalMs,
    staleAfterSeconds: cfg.staleAfterSeconds,
    shutdown: shutdown.signal,
    log,
    sleep,
  });
  log("stopped");
}

// Run only as the entry point; tests import runWorker without side effects.
if (process.argv[1] && /recap-worker[\\/]worker\.[cm]?[tj]s$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(`[recap-worker] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
