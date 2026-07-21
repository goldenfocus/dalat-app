import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeAudio } from "@/lib/ai/content-analyzers";
import {
  enqueueCaptionJob,
  isCaptionWorkerAlive,
} from "@/lib/ai/caption-jobs";
import { sendTelegram } from "@/lib/alerts/telegram";

export const maxDuration = 300;

const DEFAULT_BATCH = 50;
const MAX_BATCH = 200;
// PostgREST .in() filters ride in the GET URL — keep chunks well under limits.
const IN_CHUNK = 200;
// A video with no playback URL after this long will never transcode
// (transcoding happens at upload) — settle it instead of rescanning forever.
const VIDEO_NEVER_TRANSCODED_MS = 7 * 24 * 60 * 60 * 1000;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PendingMoment {
  id: string;
  content_type: string;
  media_url: string | null;
  file_url: string | null;
  cf_video_uid: string | null;
  cf_playback_url: string | null;
  mime_type: string | null;
  original_filename: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  video_duration_seconds: number | null;
  audio_duration_seconds: number | null;
  created_at: string;
  events: {
    has_private_details: boolean;
    tribe_id: string | null;
    tribe_visibility: string | null;
  };
}

/**
 * 🚨 SACRED privacy gate: moments from secret-address events or members-only
 * tribe events never get public captions — their media URLs must never even
 * reach the vision model. They are marked 'skipped' so the pending query
 * stops retrying them forever.
 */
function isPrivacyGated(event: PendingMoment["events"]): boolean {
  return (
    event.has_private_details === true ||
    (event.tribe_id !== null && event.tribe_visibility === "members_only")
  );
}

/**
 * AI captioning pipeline, keyless edition (vault rule: no pay-per-token
 * API keys). This route is the ONLY caption_jobs enqueuer — the privacy
 * gate runs here, before any media URL leaves our tables — and the Mac
 * mini worker does the actual vision inference (subscription `claude -p`
 * or local VLM) via /api/admin/caption-jobs/*.
 *
 * Photos + videos: gate -> enqueue caption job (worker settles the moment).
 * Audio: analyzed inline through the free text-provider chain (rare).
 * PDF/documents: settled 'skipped' — no keyless analyzer exists for them.
 * Translation fan-out lives in translate-pending, NOT here — inline
 * 12-locale fan-out capped the old pipeline at ~15 moments/day.
 *
 * Failure posture (aggregator-v1 lesson — never a quiet green):
 * - query errors return 500
 * - failures with zero successes return 500
 * - failures and a dark worker with queued jobs fire a Telegram alert
 *
 * Query params:
 * - limit: max moments to handle this run (default 50, cap 200)
 * - delay: ms between inline (audio) AI calls (default 1000)
 * - dryRun: report counts without enqueueing or calling any AI
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[process-moments] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    parseInt(searchParams.get("limit") || String(DEFAULT_BATCH), 10),
    MAX_BATCH
  );
  const delay = parseInt(searchParams.get("delay") || "1000", 10);
  const dryRun = searchParams.get("dryRun") === "true";

  const supabase = getSupabase();

  // Newest-first paginated scan for unsettled moments. PostgREST filters on
  // embedded null rows are unreliable (the Inngest version's .or() never ran
  // in prod), so settlement is resolved in a second, id-scoped query per page.
  // Paginating (instead of one capped window) is what lets the backfill reach
  // ALL moments — a single newest-1000 window would strand everything older
  // once the newest rows settle.
  const PAGE_SIZE = 500;
  const MAX_SCAN = 5000; // safety valve; raise if the library ever outgrows it
  const pending: PendingMoment[] = [];
  let settledSeen = 0;
  let scanned = 0;
  // Videos still transcoding are excluded BEFORE the batch is sliced — 448
  // untranscoded videos must not eat batch slots and stall the backfill.
  let awaitingTranscode = 0;

  for (let offset = 0; offset < MAX_SCAN && pending.length < limit * 2; offset += PAGE_SIZE) {
    const { data: candidates, error: fetchError } = await supabase
      .from("moments")
      .select(
        `
        id, content_type, media_url, file_url, cf_video_uid, cf_playback_url,
        mime_type, original_filename, title, artist, album, genre,
        video_duration_seconds, audio_duration_seconds, created_at,
        events!moments_event_id_fkey!inner(has_private_details, tribe_id, tribe_visibility)
      `
      )
      .eq("status", "published")
      .in("content_type", ["photo", "image", "video", "audio", "pdf", "document"])
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (fetchError) {
      console.error("[process-moments] fetch failed:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const page = (candidates || []) as unknown as PendingMoment[];
    scanned += page.length;

    // Settlement lookup scoped to this page's ids (chunked — an unscoped
    // select silently caps at 1000 rows and would make settled moments look
    // pending, re-running the model on them forever).
    const settledIds = new Set<string>();
    const pageIds = page.map((m) => m.id);
    for (let i = 0; i < pageIds.length; i += IN_CHUNK) {
      const chunk = pageIds.slice(i, i + IN_CHUNK);
      const { data: settledRows, error: settledError } = await supabase
        .from("moment_metadata")
        .select("moment_id")
        .in("moment_id", chunk)
        .in("processing_status", ["completed", "skipped"]);
      if (settledError) {
        console.error("[process-moments] settled query failed:", settledError);
        return NextResponse.json({ error: settledError.message }, { status: 500 });
      }
      for (const row of settledRows || []) settledIds.add(row.moment_id);
    }
    settledSeen += settledIds.size;

    // pending/failed/processing all get retried — the caption_jobs UNIQUE
    // row + retry_rounds cap make re-enqueues harmless and bounded.
    for (const m of page) {
      if (settledIds.has(m.id)) continue;
      const videoNotReady =
        m.content_type === "video" && (!m.cf_playback_url || !m.cf_video_uid);
      if (
        videoNotReady &&
        Date.now() - new Date(m.created_at).getTime() < VIDEO_NEVER_TRANSCODED_MS
      ) {
        awaitingTranscode++;
        continue;
      }
      pending.push(m);
    }

    if (page.length < PAGE_SIZE) break; // library exhausted
  }

  const batch = pending.slice(0, limit);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      scanned,
      settledSeen,
      awaitingTranscode,
      pendingFound: pending.length,
      wouldProcess: batch.length,
      wouldSkipPrivacy: batch.filter((m) => isPrivacyGated(m.events)).length,
    });
  }

  let enqueued = 0;
  let retryReset = 0;
  let queuedBefore = 0;
  let audioCompleted = 0;
  let skippedPrivacy = 0;
  let skippedUnsupported = 0;
  let gaveUp = 0;
  let failed = 0;
  let audioAttempted = 0;
  const errors: { id: string; error: string }[] = [];

  const settleSkipped = async (momentId: string, reason: string) => {
    const { error } = await supabase.rpc("upsert_moment_metadata", {
      p_moment_id: momentId,
      p_processing_status: "skipped",
      p_processing_error: reason,
    });
    if (error) {
      console.error(`[process-moments] skip upsert failed for ${momentId}:`, error);
      failed++;
      errors.push({ id: momentId, error: `skip upsert: ${error.message}` });
      return false;
    }
    return true;
  };

  for (const moment of batch) {
    // Privacy gate first — before any URL leaves our infrastructure.
    if (isPrivacyGated(moment.events)) {
      if (await settleSkipped(moment.id, "privacy_gate")) skippedPrivacy++;
      continue;
    }

    try {
      switch (moment.content_type) {
        case "photo":
        case "image":
        case "video": {
          // Only never-transcoded stragglers reach here without a playback
          // URL (young ones were excluded during the scan).
          if (
            moment.content_type === "video" &&
            (!moment.cf_playback_url || !moment.cf_video_uid)
          ) {
            if (await settleSkipped(moment.id, "never_transcoded")) skippedUnsupported++;
            break;
          }
          const { outcome } = await enqueueCaptionJob(moment);
          if (outcome === "enqueued") enqueued++;
          else if (outcome === "retry_reset") retryReset++;
          else if (outcome === "queued_before") queuedBefore++;
          else if (outcome === "gave_up") {
            // Giving up on a moment is an incident, not bookkeeping — it gets
            // its own counter and its own alert below.
            if (await settleSkipped(moment.id, "caption_gave_up")) gaveUp++;
          }
          break;
        }

        case "audio": {
          const audioUrl = moment.file_url || moment.media_url;
          if (!audioUrl) throw new Error("No audio URL provided");

          if (audioAttempted > 0 && delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          audioAttempted++;
          const startTime = Date.now();

          const analysis = await analyzeAudio(audioUrl, {
            title: moment.title,
            artist: moment.artist,
            album: moment.album,
            genre: moment.genre,
            duration_seconds: moment.audio_duration_seconds,
          });
          const { error: upsertError } = await supabase.rpc("upsert_moment_metadata", {
            p_moment_id: moment.id,
            p_ai_description: analysis.ai_description,
            p_ai_title: analysis.ai_title,
            p_ai_tags: analysis.ai_tags,
            p_mood: analysis.mood,
            p_quality_score: analysis.quality_score,
            p_audio_transcript: analysis.audio_transcript,
            p_audio_summary: analysis.audio_summary,
            p_audio_language: analysis.audio_language,
            p_processing_status: "completed",
            p_processing_duration_ms: Date.now() - startTime,
          });
          if (upsertError) throw new Error(`metadata upsert failed: ${upsertError.message}`);
          audioCompleted++;
          break;
        }

        case "pdf":
        case "document": {
          // No keyless analyzer for documents — settle instead of failing
          // forever. Revisit if document moments ever matter for SEO.
          if (await settleSkipped(moment.id, "analyzer_unavailable")) skippedUnsupported++;
          break;
        }

        default:
          throw new Error(`Unknown content type: ${moment.content_type}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[process-moments] failed for ${moment.id}:`, message);
      failed++;
      errors.push({ id: moment.id, error: message });

      const { error: failUpsertError } = await supabase.rpc("upsert_moment_metadata", {
        p_moment_id: moment.id,
        p_processing_status: "failed",
        p_processing_error: message,
      });
      if (failUpsertError) {
        console.error(`[process-moments] failed-status upsert also failed for ${moment.id}:`, failUpsertError);
      }
    }
  }

  // Queue depth + failed-job count + worker liveness — enqueueing into a
  // dark or dying queue must be loud, not a quiet backlog. (counts via GET,
  // not HEAD: workerd hangs on head:true count queries.) An unreadable
  // queue must not read as depth zero — that would suppress the dark-worker
  // alert exactly when it matters.
  const { count: queueDepth, error: depthError } = await supabase
    .from("caption_jobs")
    .select("id", { count: "exact" })
    .in("status", ["pending", "processing"])
    .limit(1);
  const { count: failedJobs, error: failedJobsError } = await supabase
    .from("caption_jobs")
    .select("id", { count: "exact" })
    .eq("status", "failed")
    .limit(1);
  const workerAlive = await isCaptionWorkerAlive();

  const result = {
    processed: batch.length,
    enqueued,
    retryReset,
    queuedBefore,
    audioCompleted,
    skippedPrivacy,
    skippedUnsupported,
    gaveUp,
    awaitingTranscode,
    failed,
    queueDepth: queueDepth ?? null,
    failedJobs: failedJobs ?? null,
    workerAlive,
    remainingFound: pending.length - batch.length,
    scanned,
    errorDetails: errors.length > 0 ? errors.slice(0, 10) : undefined,
  };

  console.log("[process-moments]", JSON.stringify(result));

  // Both cron transports swallow HTTP statuses, so the route alerts itself.
  if (failed > 0 || gaveUp > 0) {
    await sendTelegram(
      `🚨 <b>process-moments</b>: ${failed} failed, ${gaveUp} gave up permanently (${enqueued} enqueued, ${audioCompleted} audio ok, ${skippedPrivacy} privacy-skipped)` +
        (errors.length > 0 ? `\nfirst error: ${errors[0].error.slice(0, 200)}` : "")
    );
  } else if (depthError || failedJobsError) {
    await sendTelegram(
      `⚠️ <b>process-moments</b>: caption queue unreadable (${(depthError || failedJobsError)!.message.slice(0, 200)})`
    );
  } else if ((failedJobs ?? 0) > 0) {
    // Worker-side failure storms (CLI drift, CDN refusals, RPC drift) show
    // up here within one cron tick instead of after 3 silent retry days.
    await sendTelegram(
      `⚠️ <b>process-moments</b>: ${failedJobs} caption job(s) in failed state awaiting daily retry — check the worker log on the mini`
    );
  } else if ((queueDepth ?? 0) > 0 && !workerAlive) {
    await sendTelegram(
      `⚠️ <b>process-moments</b>: ${queueDepth} caption job(s) queued but the Mac mini caption worker is dark (no heartbeat in 15 min)`
    );
  }

  // Failures with zero progress of any kind mean the pipeline itself is
  // broken (broken RPC, dead queue) — surface as a cron failure.
  if (
    failed > 0 &&
    enqueued === 0 &&
    audioCompleted === 0 &&
    skippedPrivacy === 0 &&
    skippedUnsupported === 0
  ) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
