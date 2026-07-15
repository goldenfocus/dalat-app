import { NextResponse } from "next/server";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";

/**
 * Report a failed generation attempt.
 *
 * POST { jobId, error } -> requeues the job (attempts < 3) or marks it
 * failed. Attempts were already incremented at claim time.
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
  const { jobId, error: jobError } = body as { jobId?: string; error?: string };

  if (!jobId) {
    return NextResponse.json({ error: "Missing required field: jobId" }, { status: 400 });
  }

  const admin = getImageJobsAdmin();
  const { data: job, error: fetchError } = await admin
    .from("image_jobs")
    .select("status, attempts")
    .eq("id", jobId)
    .single();

  if (fetchError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "processing") {
    return NextResponse.json({ ok: true }); // already resolved elsewhere
  }

  const exhausted = job.attempts >= 3;
  const { error: updateError } = await admin
    .from("image_jobs")
    .update({
      status: exhausted ? "failed" : "pending",
      error: String(jobError ?? "generation failed").slice(0, 500),
      ...(exhausted ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", jobId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, requeued: !exhausted });
}
