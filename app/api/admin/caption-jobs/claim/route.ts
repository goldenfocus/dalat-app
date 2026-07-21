import { NextResponse } from "next/server";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";
import { touchCaptionWorkerHeartbeat } from "@/lib/ai/caption-jobs";

/**
 * Claim caption jobs for the external worker (Mac mini).
 *
 * POST { limit? } -> { jobs: [{ id, content_type, prompt, media_urls }] }
 *
 * Claiming is atomic (claim_caption_jobs: SKIP LOCKED + 15-min lease +
 * 3-attempt budget), and every poll doubles as the caption-worker heartbeat.
 * Jobs only ever contain media that already passed the privacy gate — the
 * cron is the sole enqueuer.
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
  const requestedLimit = Number((body as { limit?: number }).limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 20)
    : 10;

  const admin = getImageJobsAdmin();
  const { data: jobs, error } = await admin.rpc("claim_caption_jobs", { p_limit: limit });

  if (error) {
    // No heartbeat on a failed claim — "worker polled" must mean "queue
    // works", otherwise jobs strand in pending while the queue looks alive.
    console.error("[caption-jobs] claim_caption_jobs failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await touchCaptionWorkerHeartbeat();

  return NextResponse.json({
    jobs: (jobs ?? []).map(
      (job: { id: string; content_type: string; prompt: string; media_urls: string[] }) => ({
        id: job.id,
        content_type: job.content_type,
        prompt: job.prompt,
        media_urls: job.media_urls,
      })
    ),
  });
}
