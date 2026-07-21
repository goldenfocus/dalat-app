import { NextResponse } from "next/server";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";

/**
 * Report a failed caption attempt — or release an unattempted claim.
 *
 * POST { jobId, error } -> requeues the job (attempts < 3) or marks it
 * failed AND settles the moment as failed so the cron's daily retry-reset
 * (bounded by retry_rounds) can pick it up later. Attempts were already
 * incremented at claim time.
 *
 * POST { jobId, error, release: true } -> the worker claimed the job but
 * never ran inference (claude quota window, providers offline). The job
 * goes back to pending and the claim-time attempt is refunded — a quota
 * outage must not march jobs to 'failed' without one real attempt.
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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { jobId, error: jobError, release } = body as {
    jobId?: string;
    error?: string;
    release?: boolean;
  };

  if (!jobId) {
    return NextResponse.json({ error: "Missing required field: jobId" }, { status: 400 });
  }

  const admin = getImageJobsAdmin();
  const { data: job, error: fetchError } = await admin
    .from("caption_jobs")
    .select("status, attempts, moment_id")
    .eq("id", jobId)
    .single();

  if (fetchError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "processing") {
    return NextResponse.json({ ok: true }); // already resolved elsewhere
  }

  if (release === true) {
    const { error: releaseError } = await admin
      .from("caption_jobs")
      .update({
        status: "pending",
        attempts: Math.max(job.attempts - 1, 0),
        claimed_at: null,
        error: String(jobError ?? "released without attempt").slice(0, 500),
      })
      .eq("id", jobId);
    if (releaseError) {
      return NextResponse.json({ error: releaseError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, released: true });
  }

  const exhausted = job.attempts >= 3;
  const message = String(jobError ?? "caption failed").slice(0, 500);
  const { error: updateError } = await admin
    .from("caption_jobs")
    .update({
      status: exhausted ? "failed" : "pending",
      error: message,
      ...(exhausted ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", jobId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (exhausted) {
    const { error: metadataError } = await admin.rpc("upsert_moment_metadata", {
      p_moment_id: job.moment_id,
      p_processing_status: "failed",
      p_processing_error: message,
    });
    if (metadataError) {
      console.error(`[caption-jobs] failed-status upsert failed for ${job.moment_id}:`, metadataError);
    }
  }

  return NextResponse.json({ ok: true, requeued: !exhausted });
}
