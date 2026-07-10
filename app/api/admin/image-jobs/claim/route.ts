import { NextResponse } from "next/server";
import { getImageJobsAdmin, touchWorkerHeartbeat } from "@/lib/ai/image-jobs";

/**
 * Claim image generation jobs for the external worker (Mac mini).
 *
 * POST { limit? } -> { jobs: [{ id, context, prompt, width, height }] }
 *
 * Claiming is atomic (claim_image_jobs: SKIP LOCKED + 5-min lease +
 * 3-attempt budget), and every poll doubles as the worker heartbeat.
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
    ? Math.min(Math.max(requestedLimit, 1), 5)
    : 2;

  const admin = getImageJobsAdmin();
  const { data: jobs, error } = await admin.rpc("claim_image_jobs", { p_limit: limit });

  if (error) {
    // No heartbeat on a failed claim — "worker polled" must mean "queue
    // works", otherwise enqueues stay open while jobs strand in pending.
    console.error("[image-jobs] claim_image_jobs failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await touchWorkerHeartbeat();

  return NextResponse.json({
    jobs: (jobs ?? []).map((job: { id: string; context: string; prompt: string; width: number; height: number }) => ({
      id: job.id,
      context: job.context,
      prompt: job.prompt,
      width: job.width,
      height: job.height,
    })),
  });
}
