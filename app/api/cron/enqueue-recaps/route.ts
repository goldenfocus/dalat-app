import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegram } from "@/lib/alerts/telegram";
import {
  selectAutoRecapCandidates,
  enqueueRecapJob,
  AUTO_RECAP_WINDOW_DAYS,
  type AutoRecapEventRow,
} from "@/lib/blog/enqueue-recap";

export const maxDuration = 120;

// Drip, don't blast (spec D5): a handful of recaps per day keeps review
// load sane and avoids an IndexNow-style burst when a backlog appears.
const MAX_ENQUEUES_PER_RUN = 5;
// Multi-day events end after they start — scan a padded starts_at window.
const SCAN_PAD_DAYS = 3;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Recap flywheel Phase 2: auto-enqueue recap jobs for events that ended
 * recently and pass the eligibility fence (published, not secret-address,
 * not members-only tribe, ≥3 captioned moments). Publishing stays manual —
 * this only produces drafts for the moderator card. The moderator button
 * remains the fallback for events outside the window.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[enqueue-recaps] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const now = new Date();
  const scanFloor = new Date(
    now.getTime() - (AUTO_RECAP_WINDOW_DAYS + SCAN_PAD_DAYS) * 86_400_000
  ).toISOString();

  const { data: recent, error: eventsError } = await supabase
    .from("events")
    .select(
      "id, slug, status, starts_at, ends_at, has_private_details, tribe_id, tribe_visibility"
    )
    .gte("starts_at", scanFloor)
    .lte("starts_at", now.toISOString());

  if (eventsError) {
    console.error("[enqueue-recaps] events query failed:", eventsError);
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const candidates = selectAutoRecapCandidates(
    (recent ?? []) as unknown as AutoRecapEventRow[],
    now
  );

  if (candidates.length === 0) {
    const result = { scanned: recent?.length ?? 0, candidates: 0, enqueued: 0 };
    console.log("[enqueue-recaps]", JSON.stringify(result));
    return NextResponse.json(result);
  }

  // Skip events that already have a recap job (any status — failed jobs
  // alert via the process-moments tick, auto-requeueing them could loop)
  // or an existing recap draft/post.
  const ids = candidates.map((c) => c.id);
  const [jobsRes, postsRes] = await Promise.all([
    supabase
      .from("caption_jobs")
      .select("event_id")
      .eq("content_type", "recap")
      .in("event_id", ids),
    supabase.from("blog_posts").select("event_id").in("event_id", ids),
  ]);

  if (jobsRes.error || postsRes.error) {
    const err = (jobsRes.error || postsRes.error)!;
    console.error("[enqueue-recaps] dedup query failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const covered = new Set<string>([
    ...(jobsRes.data ?? []).map((j) => j.event_id as string),
    ...(postsRes.data ?? []).map((p) => p.event_id as string),
  ]);
  const todo = candidates.filter((c) => !covered.has(c.id));
  const batch = todo.slice(0, MAX_ENQUEUES_PER_RUN);

  let enqueued = 0;
  let tooFewCaptioned = 0;
  let skippedPrivate = 0;
  // A not_found for an id this run just SELECTed is anomalous (deleted
  // mid-run at best) — it gets its own counter so a spike is visible.
  let notFound = 0;
  let failed = 0;
  const errors: { id: string; error: string }[] = [];
  const enqueuedSlugs: string[] = [];

  for (const event of batch) {
    const result = await enqueueRecapJob(supabase, event.id);
    if (result.outcome === "enqueued") {
      enqueued++;
      const slug = (recent ?? []).find((r) => r.id === event.id)?.slug;
      if (slug) enqueuedSlugs.push(slug);
    } else if (result.outcome === "skipped") {
      if (result.reason === "too_few_captioned") tooFewCaptioned++;
      else if (result.reason === "not_found") notFound++;
      else skippedPrivate++;
    } else {
      failed++;
      errors.push({ id: event.id, error: result.message });
      console.error(`[enqueue-recaps] enqueue failed for ${event.id}:`, result.message);
    }
  }

  const result = {
    scanned: recent?.length ?? 0,
    candidates: candidates.length,
    alreadyCovered: covered.size,
    processed: batch.length,
    deferred: todo.length - batch.length,
    enqueued,
    enqueuedSlugs,
    tooFewCaptioned,
    skippedPrivate,
    notFound,
    failed,
    errorDetails: errors.length > 0 ? errors : undefined,
  };
  console.log("[enqueue-recaps]", JSON.stringify(result));

  // Cron transports swallow HTTP statuses — failures must alert themselves.
  if (failed > 0) {
    await sendTelegram(
      `🚨 <b>enqueue-recaps</b>: ${failed} recap enqueue(s) failed (${enqueued} ok)` +
        (errors.length > 0 ? `\nfirst error: ${errors[0].error.slice(0, 200)}` : "")
    );
    if (enqueued === 0) {
      return NextResponse.json(result, { status: 500 });
    }
  }

  return NextResponse.json(result);
}
