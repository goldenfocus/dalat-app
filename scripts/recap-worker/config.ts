import { hostname } from "node:os";
import { z } from "zod";

const KIND = /^[a-z][a-z0-9_]{1,40}$/;

const envSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    RECAP_WORKER_ID: z.string().trim().min(1).max(64).optional(),
    RECAP_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(600_000).default(15_000),
    RECAP_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
    RECAP_STALE_AFTER_SECONDS: z.coerce.number().int().min(60).max(86_400).default(600),
  })
  .refine((e) => e.RECAP_HEARTBEAT_INTERVAL_MS * 3 <= e.RECAP_STALE_AFTER_SECONDS * 1000, {
    message: "RECAP_STALE_AFTER_SECONDS must be at least 3x RECAP_HEARTBEAT_INTERVAL_MS",
    path: ["RECAP_STALE_AFTER_SECONDS"],
  });

export interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  workerId: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  staleAfterSeconds: number;
}

/** Throws with variable names only; never echoes a value (the key is a secret). */
export function parseConfig(
  env: Record<string, string | undefined>,
  host: string = hostname(),
): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid recap worker environment: ${names.join("; ")}`);
  }
  const e = parsed.data;
  return {
    supabaseUrl: e.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY,
    workerId: e.RECAP_WORKER_ID ?? host.slice(0, 64),
    pollIntervalMs: e.RECAP_POLL_INTERVAL_MS,
    heartbeatIntervalMs: e.RECAP_HEARTBEAT_INTERVAL_MS,
    staleAfterSeconds: e.RECAP_STALE_AFTER_SECONDS,
  };
}

export interface CliOptions {
  mode: "once" | "loop";
  dryRun: boolean;
  kinds: string[];
}

export const DEFAULT_KINDS = ["recap_short"];

export function parseArgs(argv: string[]): CliOptions {
  let once = false;
  let loop = false;
  let dryRun = false;
  let kinds = DEFAULT_KINDS;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--once") once = true;
    else if (arg === "--loop") loop = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--kinds" || arg.startsWith("--kinds=")) {
      const raw = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++i];
      kinds = (raw ?? "").split(",").map((k) => k.trim()).filter(Boolean);
      if (kinds.length === 0 || kinds.some((k) => !KIND.test(k))) {
        throw new Error("--kinds needs a comma-separated list of snake_case kinds");
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (once && loop) throw new Error("Use either --once or --loop, not both");
  return { mode: loop ? "loop" : "once", dryRun, kinds };
}
