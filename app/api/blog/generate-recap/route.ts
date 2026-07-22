import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";
import { enqueueRecapJob } from "@/lib/blog/enqueue-recap";

/**
 * POST /api/blog/generate-recap  { eventId }
 *
 * Enqueues a keyless recap job on the caption_jobs queue (content_type
 * 'recap'). The Mac-mini worker runs the prompt via `claude -p`;
 * caption-jobs/complete parses the output and writes the storage-only
 * blog_posts draft. Moderator publishes via /api/blog/publish-recap.
 *
 * The eligibility fence (privacy exclusions, ≥3 captioned moments) lives
 * in lib/blog/enqueue-recap.ts, shared with the auto-enqueue cron. This
 * route is the regenerate path — it replaces any previous recap job.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !hasRoleLevel(profile.role as UserRole, "moderator")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { eventId } = body as { eventId: string };
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  // caption_jobs is service-role-only (RLS enabled, zero policies)
  const admin = getImageJobsAdmin();
  const result = await enqueueRecapJob(admin, eventId, { replace: true });

  if (result.outcome === "enqueued") {
    return NextResponse.json({ enqueued: true, stats: result.stats });
  }

  if (result.outcome === "skipped") {
    switch (result.reason) {
      case "not_found":
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      case "private":
        return NextResponse.json(
          { error: "Secret-address events don't get AI recaps" },
          { status: 400 }
        );
      case "too_few_captioned":
        return NextResponse.json(
          {
            error: `Need at least 3 captioned moments (have ${result.eligibleMoments ?? 0})`,
          },
          { status: 400 }
        );
      case "already_queued":
        // Replace mode deletes first, so a conflict means a concurrent
        // enqueue won the race — the job the moderator wanted exists.
        return NextResponse.json({ enqueued: true, raced: true });
    }
  }

  return NextResponse.json({ error: result.message }, { status: 500 });
}
