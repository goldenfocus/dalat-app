import type { SupabaseClient } from "@supabase/supabase-js";
import {
  selectRecapMoments,
  buildRecapPrompt,
  RECAP_PROMPT_VERSION,
  type RecapMomentRow,
} from "./recap-input";

/**
 * Shared recap enqueue — used by the moderator button
 * (/api/blog/generate-recap, replace mode) and the auto-enqueue cron
 * (/api/cron/enqueue-recaps, insert-only). One fence, two callers: the
 * privacy checks and the ≥3-captioned-moments floor live here so the cron
 * can never drift looser than the button.
 */

/** Auto-enqueue scan window: events that ended between MIN_AGE_HOURS and
 * WINDOW_DAYS ago. The 24h floor lets the post-event photo wave upload and
 * get captioned before the recap is written; the 14-day ceiling keeps the
 * scan small — stragglers stay reachable via the moderator button. */
export const AUTO_RECAP_WINDOW_DAYS = 14;
export const AUTO_RECAP_MIN_AGE_HOURS = 24;

export interface AutoRecapEventRow {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  has_private_details: boolean | null;
  tribe_id: string | null;
  tribe_visibility: string | null;
}

/** Pure window + privacy filter for the cron. Eligibility that needs the
 * database (captioned-moment count, existing job/draft) is checked later. */
export function selectAutoRecapCandidates(
  events: AutoRecapEventRow[],
  now: Date
): AutoRecapEventRow[] {
  const newest = now.getTime() - AUTO_RECAP_MIN_AGE_HOURS * 3_600_000;
  const oldest = now.getTime() - AUTO_RECAP_WINDOW_DAYS * 86_400_000;
  return events.filter((e) => {
    if (e.status !== "published") return false;
    // Privacy fence: secret-address and members-only tribe events never get
    // recaps (their moments settle 'skipped' too — this is the explicit layer).
    if (e.has_private_details) return false;
    if (e.tribe_id && e.tribe_visibility === "members_only") return false;
    const endedAt = new Date(e.ends_at ?? e.starts_at).getTime();
    return endedAt >= oldest && endedAt <= newest;
  });
}

export type EnqueueRecapResult =
  | {
      outcome: "enqueued";
      stats: { eligibleMoments: number; photoCount: number; videoCount: number };
    }
  | {
      outcome: "skipped";
      reason: "not_found" | "private" | "too_few_captioned" | "already_queued";
      eligibleMoments?: number;
    }
  | { outcome: "error"; message: string };

/**
 * Build the recap prompt for one event and enqueue it on caption_jobs.
 * `replace: true` (moderator regenerate) deletes any prior recap job first;
 * without it a concurrent duplicate lands on the partial unique index and
 * comes back as 'already_queued'.
 */
export async function enqueueRecapJob(
  admin: SupabaseClient,
  eventId: string,
  opts: { replace?: boolean } = {}
): Promise<EnqueueRecapResult> {
  const { data: event, error: eventError } = await admin
    .from("events")
    .select(
      "id, title, slug, description, location_name, starts_at, ends_at, ai_tags, has_private_details, tribe_id, tribe_visibility, organizers(name), venues(name)"
    )
    .eq("id", eventId)
    .single();

  // PGRST116 = zero rows. Any other error is infrastructure, not absence —
  // collapsing them into not_found would hide a DB outage as a routine skip.
  if (eventError && eventError.code !== "PGRST116") {
    return { outcome: "error", message: `event fetch: ${eventError.message}` };
  }
  if (!event) return { outcome: "skipped", reason: "not_found" };
  // Defense in depth: both exclusions also hold structurally (privacy-gated
  // moments settle 'skipped' captionless), but the fence is explicit here so
  // NO caller — button or cron — can drift looser than the other.
  if (event.has_private_details) return { outcome: "skipped", reason: "private" };
  if (event.tribe_id && event.tribe_visibility === "members_only") {
    return { outcome: "skipped", reason: "private" };
  }

  const { data: moments, error: momentsError } = await admin
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

  if (momentsError) {
    // A broken moments query must not read as "0 captioned moments" — that
    // would kill the flywheel silently (aggregator-v1's `catch → []` lesson).
    return { outcome: "error", message: `moments fetch: ${momentsError.message}` };
  }

  const eligible = selectRecapMoments(rows);
  if (eligible.length < 3) {
    return {
      outcome: "skipped",
      reason: "too_few_captioned",
      eligibleMoments: eligible.length,
    };
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
    organizerName:
      (event.organizers as unknown as { name: string } | null)?.name || null,
    momentCount: eligible.length,
    photoCount,
    videoCount,
  });

  if (opts.replace) {
    // The 23505 → already_queued interpretation below is only sound if this
    // delete is KNOWN to have succeeded — a swallowed delete failure would
    // make a dead completed job look like a won race.
    const { error: deleteError } = await admin
      .from("caption_jobs")
      .delete()
      .eq("event_id", eventId)
      .eq("content_type", "recap");
    if (deleteError) {
      return { outcome: "error", message: `recap job delete: ${deleteError.message}` };
    }
  }

  const { error: insertError } = await admin.from("caption_jobs").insert({
    content_type: "recap",
    event_id: eventId,
    moment_id: null,
    media_urls: [],
    prompt,
    prompt_version: RECAP_PROMPT_VERSION,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { outcome: "skipped", reason: "already_queued" };
    }
    return { outcome: "error", message: insertError.message };
  }

  return {
    outcome: "enqueued",
    stats: { eligibleMoments: eligible.length, photoCount, videoCount },
  };
}
