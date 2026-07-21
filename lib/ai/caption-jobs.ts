import { getImageJobsAdmin } from "@/lib/ai/image-jobs";
import {
  IMAGE_ANALYSIS_PROMPT,
  IMAGE_PROMPT_VERSION,
  VIDEO_PROMPT_VERSION,
  buildVideoAnalysisPrompt,
  getCloudflareTranscript,
  getKeyFrameUrls,
  keyFrameTimestamps,
} from "@/lib/ai/content-analyzers";

/**
 * Caption job queue — vision captioning runs on the Mac mini worker
 * (subscription `claude -p` / local VLM; vault rule: no pay-per-token keys),
 * mirroring the image_jobs pattern.
 *
 * The privacy gate lives in /api/cron/process-moments, which is the ONLY
 * enqueuer — a gated moment's media URL never reaches a job row, so nothing
 * downstream can leak it. The prompt is built here at enqueue time and
 * travels in the row: prompt changes deploy with the app, the worker stays
 * dumb.
 */

const CAPTION_WORKER_NAME = "caption-worker";
// The worker polls every ~60s but a claude -p batch can hold it for minutes.
const HEARTBEAT_STALE_MS = 15 * 60 * 1000;
/** A failed job earns another round of worker attempts after this long. */
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
/** Rounds of (3 worker attempts) before the moment settles as given up. */
const MAX_RETRY_ROUNDS = 3;

export interface CaptionableMoment {
  id: string;
  content_type: string;
  media_url: string | null;
  file_url: string | null;
  cf_video_uid: string | null;
  cf_playback_url: string | null;
  video_duration_seconds: number | null;
}

export type EnqueueCaptionOutcome =
  | "enqueued" // new job row created
  | "queued_before" // live job already exists — nothing to do
  | "retry_reset" // failed job re-opened for another round of attempts
  | "gave_up"; // out of retry rounds — caller settles the moment

/** True when the Mac mini caption worker has claimed recently. */
export async function isCaptionWorkerAlive(): Promise<boolean> {
  const admin = getImageJobsAdmin();
  const { data, error } = await admin
    .from("worker_heartbeats")
    .select("last_seen")
    .eq("worker", CAPTION_WORKER_NAME)
    .maybeSingle();
  if (error) console.error("[caption-jobs] Heartbeat read failed:", error);
  if (!data?.last_seen) return false;
  return Date.now() - new Date(data.last_seen).getTime() < HEARTBEAT_STALE_MS;
}

export async function touchCaptionWorkerHeartbeat(): Promise<void> {
  const admin = getImageJobsAdmin();
  const { error } = await admin
    .from("worker_heartbeats")
    .upsert({ worker: CAPTION_WORKER_NAME, last_seen: new Date().toISOString() });
  if (error) {
    console.error("[caption-jobs] Heartbeat write failed:", error);
    throw new Error(`Heartbeat write failed: ${error.message}`);
  }
}

/**
 * Enqueue (or re-open) the caption job for a moment. One job per moment —
 * the UNIQUE(moment_id) row doubles as the audit trail (provider, model,
 * prompt_version), so re-captioning a provider's output later is a WHERE
 * clause, not archaeology.
 */
export async function enqueueCaptionJob(
  moment: CaptionableMoment
): Promise<{ outcome: EnqueueCaptionOutcome }> {
  const admin = getImageJobsAdmin();

  // Queue read/write errors THROW (aggregator-v1 lesson): a broken
  // caption_jobs table must surface as cron failures, never resolve to a
  // success-shaped outcome.
  const { data: existing, error: lookupError } = await admin
    .from("caption_jobs")
    .select("id, status, retry_rounds, completed_at")
    .eq("moment_id", moment.id)
    .maybeSingle();
  if (lookupError) {
    throw new Error(`caption job lookup failed: ${lookupError.message}`);
  }

  if (existing) {
    if (existing.status !== "failed") {
      return { outcome: "queued_before" };
    }
    const failedAt = existing.completed_at
      ? new Date(existing.completed_at).getTime()
      : 0;
    if (Date.now() - failedAt < RETRY_AFTER_MS) {
      return { outcome: "queued_before" }; // let the dust settle first
    }
    if (existing.retry_rounds >= MAX_RETRY_ROUNDS) {
      return { outcome: "gave_up" };
    }
    const { error: resetError } = await admin
      .from("caption_jobs")
      .update({
        status: "pending",
        attempts: 0,
        retry_rounds: existing.retry_rounds + 1,
        error: null,
        claimed_at: null,
        completed_at: null,
      })
      .eq("id", existing.id)
      .eq("status", "failed"); // don't stomp a concurrent claim
    if (resetError) {
      throw new Error(`caption job retry-reset failed: ${resetError.message}`);
    }
    return { outcome: "retry_reset" };
  }

  // Build the job payload. Videos get their transcript + key frames resolved
  // here (this server holds the Cloudflare credentials, the worker doesn't).
  let mediaUrls: string[];
  let prompt: string;
  let promptVersion: string;
  let transcript: string | null = null;
  let transcriptLanguage: string | null = null;

  if (moment.content_type === "video") {
    const transcriptResult = await getCloudflareTranscript(moment.cf_video_uid!);
    transcript = transcriptResult?.text || null;
    transcriptLanguage = transcriptResult?.language || null;
    mediaUrls = getKeyFrameUrls(
      moment.cf_playback_url!,
      keyFrameTimestamps(moment.video_duration_seconds)
    ).slice(0, 3);
    if (mediaUrls.length === 0) {
      throw new Error("Could not derive key frame URLs from playback URL");
    }
    prompt = buildVideoAnalysisPrompt(transcript);
    promptVersion = VIDEO_PROMPT_VERSION;
  } else {
    const imageUrl = moment.media_url || moment.file_url;
    if (!imageUrl) {
      throw new Error("No image URL provided");
    }
    mediaUrls = [imageUrl];
    prompt = IMAGE_ANALYSIS_PROMPT;
    promptVersion = IMAGE_PROMPT_VERSION;
  }

  const { error: insertError } = await admin.from("caption_jobs").insert({
    moment_id: moment.id,
    content_type: moment.content_type === "video" ? "video" : "image",
    media_urls: mediaUrls,
    transcript,
    transcript_language: transcriptLanguage,
    prompt,
    prompt_version: promptVersion,
  });

  if (insertError) {
    // 23505 = another run enqueued it between our lookup and insert
    if (insertError.code === "23505") {
      return { outcome: "queued_before" };
    }
    throw new Error(`enqueue failed: ${insertError.message}`);
  }

  return { outcome: "enqueued" };
}
