import { NextResponse } from "next/server";
import { R2StorageProvider } from "@/lib/storage/r2";
import { isR2Configured } from "@/lib/storage";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";

/**
 * Presign the R2 upload for a claimed image job.
 *
 * POST { jobId } -> { uploadUrl }
 *
 * The bucket and key were minted server-side at enqueue time and live on
 * the job row — the worker cannot choose where the bytes land. The worker
 * PUTs directly to R2 (Cloudflare WAF blocks binary POSTs through the app).
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
  const { jobId } = body as { jobId?: string };

  if (!jobId) {
    return NextResponse.json({ error: "Missing required field: jobId" }, { status: 400 });
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 storage not configured" }, { status: 503 });
  }

  const admin = getImageJobsAdmin();
  const { data: job, error } = await admin
    .from("image_jobs")
    .select("bucket, r2_key, status")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "processing") {
    return NextResponse.json({ error: `Job is ${job.status}, not processing` }, { status: 409 });
  }

  const provider = new R2StorageProvider();
  const uploadUrl = await provider.createPresignedUploadUrl(job.bucket, job.r2_key, {
    contentType: "image/png",
    expiresIn: 600, // 10 minutes
  });

  return NextResponse.json({ uploadUrl });
}
