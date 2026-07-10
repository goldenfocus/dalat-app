import { NextResponse } from "next/server";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";
import { saveImageVersion } from "@/lib/image-versions";
import type { ImageVersionContentType, ImageVersionFieldName } from "@/lib/types";

/**
 * Mark an image job done.
 *
 * POST { jobId } -> sets image_jobs.result_url to the CDN URL for the
 * key minted at enqueue time. Deliberately writes NOTHING else: parent
 * tables (profiles, events, ...) are only updated when the user applies
 * the image through their own authed flow.
 */

const VERSION_TYPES: Record<string, { contentType: ImageVersionContentType; fieldName: ImageVersionFieldName }> = {
  avatar: { contentType: "profile", fieldName: "avatar" },
  "event-cover": { contentType: "event", fieldName: "cover_image" },
  "venue-cover": { contentType: "venue", fieldName: "cover_image" },
  "blog-cover": { contentType: "blog", fieldName: "cover_image" },
};

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("Authorization");
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    console.error("ADMIN_API_KEY not configured");
    return false;
  }
  return authHeader === `Bearer ${adminKey}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { jobId } = body as { jobId?: string };

  if (!jobId) {
    return NextResponse.json({ error: "Missing required field: jobId" }, { status: 400 });
  }

  const admin = getImageJobsAdmin();
  const { data: job, error: fetchError } = await admin
    .from("image_jobs")
    .select("bucket, r2_key, status, context, entity_id, prompt, user_id")
    .eq("id", jobId)
    .single();

  if (fetchError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status === "done") {
    return NextResponse.json({ ok: true }); // idempotent
  }

  const resultUrl = `https://cdn.dalat.app/${job.bucket}/${job.r2_key}`;

  const { error: updateError } = await admin
    .from("image_jobs")
    .update({
      status: "done",
      result_url: resultUrl,
      completed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", jobId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Version history (append-only record, not a live surface)
  const versionTypes = VERSION_TYPES[job.context];
  if (job.entity_id && versionTypes) {
    await saveImageVersion({
      contentType: versionTypes.contentType,
      contentId: job.entity_id,
      fieldName: versionTypes.fieldName,
      imageUrl: resultUrl,
      generationPrompt: job.prompt,
      createdBy: job.user_id,
    });
  }

  return NextResponse.json({ ok: true, resultUrl });
}
