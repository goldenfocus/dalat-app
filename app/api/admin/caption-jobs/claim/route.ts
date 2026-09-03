import { isRecapEventPublic } from "@/lib/blog/enqueue-recap";
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
  const lease = body as { renewJobId?: string; claimedAt?: string };
  if (lease.renewJobId && lease.claimedAt) {
    const admin = getImageJobsAdmin();
    const claimedAt = new Date().toISOString();
    const { data, error } = await admin
      .from("caption_jobs")
      .update({ claimed_at: claimedAt })
      .eq("id", lease.renewJobId)
      .eq("status", "processing")
      .eq("claimed_at", lease.claimedAt)
      .select("id");
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    await touchCaptionWorkerHeartbeat();
    return NextResponse.json({ claimedAt: data?.length ? claimedAt : null });
  }
  const requestedLimit = Number((body as { limit?: number }).limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 20)
    : 10;

  const admin = getImageJobsAdmin();
  const { data: jobs, error } = await admin.rpc("claim_caption_jobs", {
    p_limit: limit,
  });

  if (error) {
    // No heartbeat on a failed claim — "worker polled" must mean "queue
    // works", otherwise jobs strand in pending while the queue looks alive.
    console.error("[caption-jobs] claim_caption_jobs failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await touchCaptionWorkerHeartbeat();

  const claimed = (jobs ?? []) as {
    id: string;
    event_id: string | null;
    moment_id: string | null;
    content_type: string;
    prompt: string;
    media_urls: string[];
    transcript: string | null;
    transcript_language: string | null;
    claimed_at: string;
  }[];
  const momentIds = claimed.flatMap((job) =>
    job.moment_id ? [job.moment_id] : [],
  );
  const { data: moments, error: mediaError } = momentIds.length
    ? await admin
        .from("moments")
        .select(
          "id, status, cf_playback_url, media_url, file_url, events!moments_event_id_fkey(status, has_private_details, tribe_id, tribe_visibility)",
        )
        .in("id", momentIds)
    : { data: [], error: null };
  if (mediaError)
    return NextResponse.json({ error: mediaError.message }, { status: 500 });
  const byId = new Map((moments ?? []).map((moment) => [moment.id, moment]));
  const safeJobs = [];
  for (const job of claimed) {
    const moment = byId.get(job.moment_id ?? "");
    const { data: recapEvent, error: eventError } = job.event_id
      ? await admin
          .from("events")
          .select("status, has_private_details, tribe_id, tribe_visibility")
          .eq("id", job.event_id)
          .maybeSingle()
      : { data: null, error: null };
    if (eventError)
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    const event =
      recapEvent ||
      (moment?.events as unknown as
        | Parameters<typeof isRecapEventPublic>[0]
        | null);
    if (
      !event ||
      !isRecapEventPublic(event) ||
      (moment && moment.status !== "published")
    ) {
      const { error } = await admin
        .from("caption_jobs")
        .update({
          status: "failed",
          error: "privacy_gate",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "processing");
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      if (job.moment_id)
        await admin.rpc("upsert_moment_metadata", {
          p_moment_id: job.moment_id,
          p_processing_status: "skipped",
          p_processing_error: "privacy_gate",
        });
      continue;
    }
    safeJobs.push({
      ...job,
      audio_source_url:
        job.content_type === "video"
          ? moment?.cf_playback_url
          : moment?.file_url || moment?.media_url,
    });
  }
  return NextResponse.json({ jobs: safeJobs });
}
