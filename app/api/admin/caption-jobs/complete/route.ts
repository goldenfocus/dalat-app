import { NextResponse } from "next/server";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";
import {
  normalizeImageAnalysis,
  normalizeVideoAnalysis,
} from "@/lib/ai/content-analyzers";
import { parseRecapOutput } from "@/lib/blog/recap-input";
import { triggerTranslationServer } from "@/lib/translations";

/**
 * Complete a caption job with the model's raw output.
 *
 * POST { jobId, output, provider, model } -> parses + validates the output,
 * upserts moment_metadata (settling the moment as completed), and records
 * provider/model/result on the job row for auditability.
 *
 * The worker sends the model's raw TEXT — parsing and validation live here,
 * server-side, so a hallucinating model can never write garbage columns.
 * A 422 tells the worker to report the attempt via /fail.
 *
 * Translation fan-out deliberately does NOT happen here: translate-pending
 * sweeps caption fields on its own cadence (the inline 12-locale fan-out was
 * what capped the old pipeline at ~15 moments/day).
 */

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("Authorization");
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    console.error("ADMIN_API_KEY not configured");
    return false;
  }
  return authHeader === `Bearer ${adminKey}`;
}

function parseModelJson(output: string): unknown {
  let text = output.trim();
  if (text.startsWith("```json")) text = text.slice(7);
  else if (text.startsWith("```")) text = text.slice(3);
  if (text.endsWith("```")) text = text.slice(0, -3);
  text = text.trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Model output was not valid JSON: ${text.slice(0, 200)}`);
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { jobId, output, provider, model } = body as {
    jobId?: string;
    output?: string;
    provider?: string;
    model?: string;
  };

  if (!jobId || typeof output !== "string" || !output.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: jobId, output" },
      { status: 400 }
    );
  }

  const admin = getImageJobsAdmin();
  const { data: job, error: fetchError } = await admin
    .from("caption_jobs")
    .select("id, moment_id, event_id, content_type, status, claimed_at, transcript, transcript_language, media_urls")
    .eq("id", jobId)
    .single();

  if (fetchError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status === "done") {
    return NextResponse.json({ ok: true }); // idempotent
  }

  // Recap jobs: parse the recap JSON, write the storage-only blog_posts
  // draft (status stays 'draft' forever — every public blog surface filters
  // status='published'; recap_published_at gates the event-page card), and
  // fan out 12-locale translation. NO technical_content — deliberately dead.
  if (job.content_type === "recap") {
    let recap;
    try {
      recap = parseRecapOutput(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const { data: event } = await admin
      .from("events")
      .select("id, title, slug, image_url")
      .eq("id", job.event_id)
      .single();
    if (!event) {
      return NextResponse.json({ error: "Recap job's event not found" }, { status: 422 });
    }

    const { data: category } = await admin
      .from("blog_categories")
      .select("id")
      .eq("slug", "stories")
      .single();

    const { data: post, error: postError } = await admin
      .from("blog_posts")
      .upsert(
        {
          event_id: event.id,
          title: `${event.title} — Event Recap`,
          slug: `recap-${event.slug}`,
          story_content: recap.story_content,
          // NOT NULL in prod; deliberately empty — keyword ballast is dead
          technical_content: "",
          meta_description: recap.meta_description,
          seo_keywords: recap.seo_keywords,
          social_share_text: recap.social_share_text,
          suggested_cta_url: `/events/${event.slug}/moments`,
          suggested_cta_text: recap.suggested_cta_text,
          cover_image_url: event.image_url,
          source: "manual",
          status: "draft",
          category_id: category?.id || null,
          recap_published_at: null,
        },
        { onConflict: "event_id" }
      )
      .select("id")
      .single();

    if (postError || !post) {
      console.error(`[caption-jobs] recap post upsert failed for event ${event.id}:`, postError);
      return NextResponse.json(
        { error: postError?.message || "post upsert failed" },
        { status: 500 }
      );
    }

    await triggerTranslationServer("blog", post.id, [
      { field_name: "title", text: `${event.title} — Event Recap` },
      { field_name: "story_content", text: recap.story_content },
      { field_name: "meta_description", text: recap.meta_description },
    ]);

    const { error: jobUpdateError } = await admin
      .from("caption_jobs")
      .update({
        status: "done",
        result: recap as unknown as Record<string, unknown>,
        provider: provider ? String(provider).slice(0, 50) : null,
        model: model ? String(model).slice(0, 100) : null,
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", jobId);
    if (jobUpdateError) {
      console.error(`[caption-jobs] recap job-row update failed for ${jobId}:`, jobUpdateError);
    }

    return NextResponse.json({ ok: true, blogPostId: post.id });
  }

  // Parse + validate BEFORE touching moment_metadata. Invalid output is a
  // failed attempt (worker reports it via /fail), never a silent half-write.
  let metadata: Record<string, unknown>;
  let normalized: unknown;
  try {
    const raw = parseModelJson(output);
    if (job.content_type === "video") {
      const analysis = normalizeVideoAnalysis(raw);
      normalized = analysis;
      metadata = {
        p_ai_description: analysis.ai_description,
        p_ai_title: analysis.ai_title,
        p_ai_tags: analysis.ai_tags,
        p_scene_description: analysis.scene_description,
        p_mood: analysis.mood,
        p_video_summary: analysis.video_summary,
        p_video_transcript: job.transcript,
        p_key_frame_urls: job.media_urls,
        p_content_language: job.transcript_language || analysis.content_language,
      };
    } else {
      const analysis = normalizeImageAnalysis(raw);
      normalized = analysis;
      metadata = {
        p_ai_description: analysis.ai_description,
        p_ai_title: analysis.ai_title,
        p_ai_tags: analysis.ai_tags,
        p_scene_description: analysis.scene_description,
        p_mood: analysis.mood,
        p_detected_objects: analysis.detected_objects,
        p_content_language: analysis.content_language,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const durationMs = job.claimed_at
    ? Date.now() - new Date(job.claimed_at).getTime()
    : null;

  const { error: upsertError } = await admin.rpc("upsert_moment_metadata", {
    p_moment_id: job.moment_id,
    ...metadata,
    p_processing_status: "completed",
    ...(durationMs !== null ? { p_processing_duration_ms: durationMs } : {}),
  });
  if (upsertError) {
    console.error(`[caption-jobs] metadata upsert failed for ${job.moment_id}:`, upsertError);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("caption_jobs")
    .update({
      status: "done",
      result: normalized,
      provider: provider ? String(provider).slice(0, 50) : null,
      model: model ? String(model).slice(0, 100) : null,
      completed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", jobId);

  if (updateError) {
    // Metadata is already settled — log loudly but don't fail the worker.
    console.error(`[caption-jobs] job-row update failed for ${jobId}:`, updateError);
  }

  return NextResponse.json({ ok: true });
}
