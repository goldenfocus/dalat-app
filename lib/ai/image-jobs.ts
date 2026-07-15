import { randomUUID } from "crypto";
import { createClient as createAdminClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasRoleLevel, type UserRole } from "@/lib/types";

/**
 * Image generation job queue — jobs are picked up by the Mac mini worker
 * (flux2-klein-4b via mflux, zero cost) instead of calling Gemini.
 *
 * The job row is the sole source of truth: ownership is verified at
 * enqueue time, the R2 key is minted at enqueue time, and the worker's
 * /complete endpoint can only write image_jobs.result_url. Parent tables
 * (events, profiles, ...) are written when the user applies the image.
 */

export type QueueImageContext = "avatar" | "event-cover" | "venue-cover" | "blog-cover";

export const QUEUE_CONTEXTS: Record<
  QueueImageContext,
  { width: number; height: number; bucket: string; folder: string }
> = {
  avatar: { width: 1024, height: 1024, bucket: "avatars", folder: "" },
  "event-cover": { width: 1216, height: 640, bucket: "event-media", folder: "" },
  "venue-cover": { width: 1216, height: 640, bucket: "venue-media", folder: "covers" },
  "blog-cover": { width: 1216, height: 640, bucket: "blog-media", folder: "covers" },
};

const WORKER_NAME = "image-worker";
const HEARTBEAT_STALE_MS = 3 * 60 * 1000; // worker polls every ~30s
const MAX_PENDING_PER_USER = 3;
const MAX_PROMPT_LENGTH = 2000;

export interface EnqueueResult {
  ok: boolean;
  jobId?: string;
  status?: number;
  error?: string;
  code?: string;
}

export function getImageJobsAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials not configured");
  return createAdminClient(url, key);
}

/** Strip control characters and cap length before the prompt travels to the worker. */
function sanitizeWorkerPrompt(prompt: string): string {
  return prompt
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
    .slice(0, MAX_PROMPT_LENGTH)
    .trim();
}

async function isModerator(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return profile?.role ? hasRoleLevel(profile.role as UserRole, "moderator") : false;
}

/**
 * Verify the requesting user may generate an image for this entity.
 * Uses the USER's supabase client so RLS applies to the lookup.
 */
async function checkOwnership(
  supabase: SupabaseClient,
  userId: string,
  context: QueueImageContext,
  entityId?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!entityId) return { ok: true }; // creation forms: nothing to overwrite, apply happens client-side

  switch (context) {
    case "avatar":
      return entityId === userId
        ? { ok: true }
        : { ok: false, error: "You can only generate your own avatar" };
    case "event-cover": {
      const { data: event } = await supabase
        .from("events")
        .select("created_by")
        .eq("id", entityId)
        .single();
      if (!event) return { ok: false, error: "Event not found" };
      if (event.created_by === userId) return { ok: true };
      return (await isModerator(supabase, userId))
        ? { ok: true }
        : { ok: false, error: "Only the event creator can generate its cover" };
    }
    case "venue-cover":
    case "blog-cover":
      return (await isModerator(supabase, userId))
        ? { ok: true }
        : { ok: false, error: "Not authorized" };
  }
}

/** True when the Mac mini worker has polled recently. */
export async function isWorkerAlive(): Promise<boolean> {
  const admin = getImageJobsAdmin();
  const { data, error } = await admin
    .from("worker_heartbeats")
    .select("last_seen")
    .eq("worker", WORKER_NAME)
    .maybeSingle();
  // A DB read failure must be loud — it presents to users exactly like a
  // dead worker, and only this log line tells the two apart.
  if (error) console.error("[image-jobs] Heartbeat read failed:", error);
  if (!data?.last_seen) return false;
  return Date.now() - new Date(data.last_seen).getTime() < HEARTBEAT_STALE_MS;
}

export async function touchWorkerHeartbeat(): Promise<void> {
  const admin = getImageJobsAdmin();
  const { error } = await admin
    .from("worker_heartbeats")
    .upsert({ worker: WORKER_NAME, last_seen: new Date().toISOString() });
  if (error) {
    console.error("[image-jobs] Heartbeat write failed:", error);
    // Propagate so the claim route 500s and the failure shows in the
    // worker's log too — a silently stale heartbeat blocks all enqueues.
    throw new Error(`Heartbeat write failed: ${error.message}`);
  }
}

export async function enqueueImageJob(params: {
  supabase: SupabaseClient; // the requesting user's client (RLS applies)
  userId: string;
  context: QueueImageContext;
  prompt: string;
  entityId?: string;
}): Promise<EnqueueResult> {
  const { supabase, userId, context, prompt, entityId } = params;

  const config = QUEUE_CONTEXTS[context];
  if (!config) {
    return { ok: false, status: 400, error: `Unsupported context: ${context}`, code: "context_unavailable" };
  }

  if (!(await isWorkerAlive())) {
    return {
      ok: false,
      status: 503,
      error: "AI image generation is temporarily unavailable. Try again soon.",
      code: "worker_offline",
    };
  }

  const ownership = await checkOwnership(supabase, userId, context, entityId);
  if (!ownership.ok) {
    return { ok: false, status: 403, error: ownership.error, code: "not_authorized" };
  }

  const admin = getImageJobsAdmin();

  // Only recent jobs count toward the cap — a job stranded by an outage
  // must not lock its owner out of generation forever.
  const { count, error: countError } = await admin
    .from("image_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["pending", "processing"])
    .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());
  if (countError) {
    // Fail closed — an unreadable queue must not become an unbounded one.
    console.error("[image-jobs] Pending-count check failed:", countError);
    return { ok: false, status: 503, error: "Queue unavailable. Try again soon.", code: "worker_offline" };
  }
  if ((count ?? 0) >= MAX_PENDING_PER_USER) {
    return {
      ok: false,
      status: 429,
      error: "You already have images generating. Wait for them to finish first.",
      code: "too_many_pending",
    };
  }

  const jobId = randomUUID();
  const filename = `ai-${jobId.slice(0, 8)}-${Date.now().toString(36)}.png`;
  const r2Key = [config.folder, entityId, filename].filter(Boolean).join("/");

  const { error: insertError } = await admin.from("image_jobs").insert({
    id: jobId,
    user_id: userId,
    context,
    prompt: sanitizeWorkerPrompt(prompt),
    width: config.width,
    height: config.height,
    entity_id: entityId ?? null,
    bucket: config.bucket,
    r2_key: r2Key,
  });

  if (insertError) {
    console.error("[image-jobs] Failed to enqueue:", insertError);
    return { ok: false, status: 500, error: "Failed to queue generation" };
  }

  return { ok: true, jobId };
}
