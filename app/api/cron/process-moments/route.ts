import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  analyzeImage,
  analyzeVideo,
  analyzeAudio,
  analyzeDocument,
} from "@/lib/ai/content-analyzers";
import { triggerTranslationServer } from "@/lib/translations";
import { sendTelegram } from "@/lib/alerts/telegram";
import type { TranslationFieldName } from "@/lib/types";

export const maxDuration = 300;

const DEFAULT_BATCH = 12;
const MAX_BATCH = 50;
// PostgREST .in() filters ride in the GET URL — keep chunks well under limits.
const IN_CHUNK = 200;

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
 * AI captioning pipeline — ported from the never-deployed Inngest
 * processPendingMoments (lib/inngest/functions/moment-processing.ts) into a
 * plain Vercel cron route. Picks up published moments without settled
 * metadata, runs the content-type-appropriate analyzer, upserts
 * moment_metadata, and fans the caption text out to 12-locale translation.
 *
 * Failure posture (aggregator-v1 lesson — never a quiet green):
 * - query errors return 500
 * - zero successes with any failures return 500
 * - ANY failure (analysis or translation) fires a Telegram alert directly —
 *   the Cloudflare cron wrapper and Vercel cron both swallow HTTP statuses.
 *
 * Query params:
 * - limit: max moments to analyze this run (default 12, cap 50)
 * - delay: ms between AI calls (default 1000)
 * - dryRun: report counts without calling any AI
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

  // Newest-first candidate window. PostgREST filters on embedded null rows
  // are unreliable (the Inngest version's .or() never ran in prod), so
  // settlement is resolved in a second, id-scoped query instead.
  const { data: candidates, error: fetchError } = await supabase
    .from("moments")
    .select(
      `
      id, content_type, media_url, file_url, cf_video_uid, cf_playback_url,
      mime_type, original_filename, title, artist, album, genre,
      video_duration_seconds, audio_duration_seconds,
      events!inner(has_private_details, tribe_id, tribe_visibility)
    `
    )
    .eq("status", "published")
    .in("content_type", ["photo", "image", "video", "audio", "pdf", "document"])
    .order("created_at", { ascending: false })
    .limit(Math.min(limit * 10, 1000));

  if (fetchError) {
    console.error("[process-moments] fetch failed:", fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const window = (candidates || []) as unknown as PendingMoment[];

  // Settlement lookup scoped to the candidate ids (chunked — an unscoped
  // select silently caps at 1000 rows and would make settled moments look
  // pending, re-running the model on them forever).
  const settledIds = new Set<string>();
  const windowIds = window.map((m) => m.id);
  for (let i = 0; i < windowIds.length; i += IN_CHUNK) {
    const chunk = windowIds.slice(i, i + IN_CHUNK);
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

  // pending/failed/processing all get retried — 'processing' only survives a
  // run that died mid-flight, and the upsert makes retries harmless.
  const pending = window.filter((m) => !settledIds.has(m.id));
  const batch = pending.slice(0, limit);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      settledInWindow: settledIds.size,
      pendingInWindow: pending.length,
      wouldProcess: batch.length,
      wouldSkipPrivacy: batch.filter((m) => isPrivacyGated(m.events)).length,
    });
  }

  let completed = 0;
  let skippedPrivacy = 0;
  let deferred = 0; // videos not yet transcoded — retried next run
  let failed = 0;
  let translationFailed = 0;
  let attempted = 0;
  const errors: { id: string; error: string }[] = [];

  for (const moment of batch) {
    // Privacy gate first — before any URL leaves our infrastructure.
    if (isPrivacyGated(moment.events)) {
      const { error } = await supabase.rpc("upsert_moment_metadata", {
        p_moment_id: moment.id,
        p_processing_status: "skipped",
        p_processing_error: "privacy_gate",
      });
      if (error) {
        console.error(`[process-moments] gate upsert failed for ${moment.id}:`, error);
        failed++;
        errors.push({ id: moment.id, error: `gate upsert: ${error.message}` });
      } else {
        skippedPrivacy++;
      }
      continue;
    }

    // Video not transcoded yet — defer without burning an AI attempt, so a
    // batch of not-ready videos can't mask a dead analyzer in the failure math.
    if (
      moment.content_type === "video" &&
      (!moment.cf_playback_url || !moment.cf_video_uid)
    ) {
      const { error } = await supabase.rpc("upsert_moment_metadata", {
        p_moment_id: moment.id,
        p_processing_status: "pending",
        p_processing_error: "Video not ready for processing",
      });
      if (error) {
        console.error(`[process-moments] defer upsert failed for ${moment.id}:`, error);
      }
      deferred++;
      continue;
    }

    if (attempted > 0 && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    attempted++;
    const startTime = Date.now();

    try {
      const { error: statusError } = await supabase.rpc("upsert_moment_metadata", {
        p_moment_id: moment.id,
        p_processing_status: "processing",
      });
      if (statusError) {
        console.error(`[process-moments] processing upsert failed for ${moment.id}:`, statusError);
      }

      let metadata: Record<string, unknown> = {};

      switch (moment.content_type) {
        case "photo":
        case "image": {
          const imageUrl = moment.media_url || moment.file_url;
          if (!imageUrl) throw new Error("No image URL provided");

          const analysis = await analyzeImage(imageUrl);
          metadata = {
            p_ai_description: analysis.ai_description,
            p_ai_title: analysis.ai_title,
            p_ai_tags: analysis.ai_tags,
            p_scene_description: analysis.scene_description,
            p_mood: analysis.mood,
            p_quality_score: analysis.quality_score,
            p_detected_objects: analysis.detected_objects,
            p_detected_text: analysis.detected_text,
            p_detected_faces_count: analysis.detected_faces_count,
            p_dominant_colors: analysis.dominant_colors,
            p_location_hints: analysis.location_hints,
            p_content_language: analysis.content_language,
          };
          break;
        }

        case "video": {
          const analysis = await analyzeVideo(
            moment.cf_playback_url!,
            moment.cf_video_uid!,
            moment.video_duration_seconds || undefined
          );
          metadata = {
            p_ai_description: analysis.ai_description,
            p_ai_title: analysis.ai_title,
            p_ai_tags: analysis.ai_tags,
            p_scene_description: analysis.scene_description,
            p_mood: analysis.mood,
            p_quality_score: analysis.quality_score,
            p_video_transcript: analysis.video_transcript,
            p_video_summary: analysis.video_summary,
            p_key_frame_urls: analysis.key_frame_urls,
            p_content_language: analysis.content_language,
          };
          break;
        }

        case "audio": {
          const audioUrl = moment.file_url || moment.media_url;
          if (!audioUrl) throw new Error("No audio URL provided");

          const analysis = await analyzeAudio(audioUrl, {
            title: moment.title,
            artist: moment.artist,
            album: moment.album,
            genre: moment.genre,
            duration_seconds: moment.audio_duration_seconds,
          });
          metadata = {
            p_ai_description: analysis.ai_description,
            p_ai_title: analysis.ai_title,
            p_ai_tags: analysis.ai_tags,
            p_mood: analysis.mood,
            p_quality_score: analysis.quality_score,
            p_audio_transcript: analysis.audio_transcript,
            p_audio_summary: analysis.audio_summary,
            p_audio_language: analysis.audio_language,
          };
          break;
        }

        case "pdf":
        case "document": {
          const docUrl = moment.file_url || moment.media_url;
          if (!docUrl) throw new Error("No document URL provided");

          const analysis = await analyzeDocument(
            docUrl,
            moment.mime_type,
            moment.original_filename
          );
          metadata = {
            p_ai_description: analysis.ai_description,
            p_ai_title: analysis.ai_title,
            p_ai_tags: analysis.ai_tags,
            p_quality_score: analysis.quality_score,
            p_pdf_summary: analysis.pdf_summary,
            p_pdf_extracted_text: analysis.pdf_extracted_text,
            p_pdf_page_count: analysis.pdf_page_count,
            p_pdf_key_topics: analysis.pdf_key_topics,
            p_content_language: analysis.content_language,
          };
          break;
        }

        default:
          throw new Error(`Unknown content type: ${moment.content_type}`);
      }

      const { error: upsertError } = await supabase.rpc("upsert_moment_metadata", {
        p_moment_id: moment.id,
        ...metadata,
        p_processing_status: "completed",
        p_processing_duration_ms: Date.now() - startTime,
      });
      if (upsertError) throw new Error(`metadata upsert failed: ${upsertError.message}`);

      // Fan every AI-generated text out to the 12-locale translation table —
      // this is what makes the captions discoverable in all languages.
      // updateSourceLocale: false — these are machine captions; the moment's
      // source_locale records the language the USER wrote in.
      const fieldsToTranslate: { field_name: TranslationFieldName; text: string }[] = [];
      const translationCandidates: [TranslationFieldName, unknown][] = [
        ["ai_description", metadata.p_ai_description],
        ["scene_description", metadata.p_scene_description],
        ["video_summary", metadata.p_video_summary],
        ["audio_summary", metadata.p_audio_summary],
        ["pdf_summary", metadata.p_pdf_summary],
        ["ai_title", metadata.p_ai_title],
        ["video_transcript", metadata.p_video_transcript],
        ["audio_transcript", metadata.p_audio_transcript],
        ["pdf_extracted_text", metadata.p_pdf_extracted_text],
      ];
      for (const [fieldName, value] of translationCandidates) {
        if (typeof value === "string" && value.length > 0) {
          fieldsToTranslate.push({
            field_name: fieldName,
            text: value.length > 5000 ? value.slice(0, 5000) : value,
          });
        }
      }
      if (fieldsToTranslate.length > 0) {
        const { ok } = await triggerTranslationServer(
          "moment",
          moment.id,
          fieldsToTranslate,
          { updateSourceLocale: false }
        );
        if (!ok) {
          translationFailed++;
          console.error(`[process-moments] translation fan-out failed for ${moment.id}`);
        }
      }

      completed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[process-moments] failed for ${moment.id}:`, message);
      failed++;
      errors.push({ id: moment.id, error: message });

      const { error: failUpsertError } = await supabase.rpc("upsert_moment_metadata", {
        p_moment_id: moment.id,
        p_processing_status: "failed",
        p_processing_error: message,
        p_processing_duration_ms: Date.now() - startTime,
      });
      if (failUpsertError) {
        console.error(`[process-moments] failed-status upsert also failed for ${moment.id}:`, failUpsertError);
      }
    }
  }

  const result = {
    processed: batch.length,
    completed,
    skippedPrivacy,
    deferred,
    failed,
    translationFailed,
    remainingInWindow: pending.length - batch.length,
    errorDetails: errors.length > 0 ? errors.slice(0, 10) : undefined,
  };

  console.log("[process-moments]", JSON.stringify(result));

  // Both cron transports swallow HTTP statuses, so the route alerts itself.
  if (failed > 0 || translationFailed > 0) {
    await sendTelegram(
      `🚨 <b>process-moments</b>: ${failed} failed, ${translationFailed} translation fan-outs failed (${completed} ok, ${skippedPrivacy} privacy-skipped)` +
        (errors.length > 0 ? `\nfirst error: ${errors[0].error.slice(0, 200)}` : "")
    );
  }

  // Failures with zero successes mean the pipeline itself is broken (dead
  // API key, bad model id, broken RPC) — surface as a cron failure.
  if (failed > 0 && completed === 0) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
