import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";
import {
  selectRecapMoments,
  buildRecapPrompt,
  RECAP_PROMPT_VERSION,
  type RecapMomentRow,
} from "@/lib/blog/recap-input";

/**
 * POST /api/blog/generate-recap  { eventId }
 *
 * Enqueues a keyless recap job on the caption_jobs queue (content_type
 * 'recap'). The Mac-mini worker runs the prompt via `claude -p`;
 * caption-jobs/complete parses the output and writes the storage-only
 * blog_posts draft. Moderator publishes via /api/blog/publish-recap.
 *
 * Privacy fence: only moments with processing_status='completed' AND a
 * non-null ai_description feed the prompt (privacy-gated moments settle
 * 'skipped' and never carry captions). Secret-address events are excluded
 * entirely. detected_text never enters the input.
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

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, slug, description, location_name, starts_at, ends_at, ai_tags, has_private_details, organizers(name), venues(name)"
    )
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.has_private_details) {
    return NextResponse.json(
      { error: "Secret-address events don't get AI recaps" },
      { status: 400 }
    );
  }

  const { data: moments } = await supabase
    .from("moments")
    .select(
      "content_type, moment_metadata(processing_status, ai_description, ai_title, scene_description, mood, detected_objects, ai_tags, video_summary, audio_summary)"
    )
    .eq("event_id", eventId)
    .eq("status", "published")
    .in("content_type", ["photo", "video", "audio", "image"])
    .limit(50);

  const rows: RecapMomentRow[] = (moments ?? []).map((m) => {
    const meta = m.moment_metadata as unknown as Partial<RecapMomentRow> | null;
    return {
      content_type: m.content_type,
      processing_status: meta?.processing_status ?? null,
      ai_description: meta?.ai_description ?? null,
      ai_title: meta?.ai_title ?? null,
      scene_description: meta?.scene_description ?? null,
      mood: meta?.mood ?? null,
      detected_objects: meta?.detected_objects ?? null,
      ai_tags: meta?.ai_tags ?? null,
      video_summary: meta?.video_summary ?? null,
      audio_summary: meta?.audio_summary ?? null,
    };
  });

  const eligible = selectRecapMoments(rows);
  if (eligible.length < 3) {
    return NextResponse.json(
      { error: `Need at least 3 captioned moments (have ${eligible.length})` },
      { status: 400 }
    );
  }

  const photoCount = eligible.filter(
    (m) => m.content_type === "photo" || m.content_type === "image"
  ).length;
  const videoCount = eligible.filter((m) => m.content_type === "video").length;

  const prompt = buildRecapPrompt({
    event: {
      title: event.title,
      description: event.description,
      location_name: event.location_name,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      ai_tags: event.ai_tags,
    },
    moments: eligible,
    venueName: (event.venues as unknown as { name: string } | null)?.name || null,
    organizerName: (event.organizers as unknown as { name: string } | null)?.name || null,
    momentCount: eligible.length,
    photoCount,
    videoCount,
  });

  // caption_jobs is service-role-only (RLS enabled, zero policies)
  const admin = getImageJobsAdmin();

  // Regenerate = replace any previous job for this event
  await admin
    .from("caption_jobs")
    .delete()
    .eq("event_id", eventId)
    .eq("content_type", "recap");

  const { error: insertError } = await admin.from("caption_jobs").insert({
    content_type: "recap",
    event_id: eventId,
    moment_id: null,
    media_urls: [],
    prompt,
    prompt_version: RECAP_PROMPT_VERSION,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    enqueued: true,
    stats: { eligibleMoments: eligible.length, photoCount, videoCount },
  });
}
