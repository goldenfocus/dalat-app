import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  selectRecapMoments,
  buildRecapPrompt,
  RECAP_PROMPT_VERSION,
  type RecapMomentRow,
} from "./recap-input";

export const AUTO_RECAP_WINDOW_DAYS = 14;
export const AUTO_RECAP_MIN_AGE_HOURS = 0;
const UPLOAD_QUIET_MS = 15 * 60_000;
const RETRY_AFTER_MS = 60 * 60_000;
const MAX_RETRY_ROUNDS = 3;

export interface AutoRecapEventRow {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  has_private_details: boolean | null;
  tribe_id: string | null;
  tribe_visibility: string | null;
}

export function isRecapEventPublic(
  event: Pick<
    AutoRecapEventRow,
    "status" | "has_private_details" | "tribe_id" | "tribe_visibility"
  >,
): boolean {
  return (
    event.status === "published" &&
    !event.has_private_details &&
    !(event.tribe_id && event.tribe_visibility === "members_only")
  );
}

export function hasEventEnded(
  event: Pick<AutoRecapEventRow, "starts_at" | "ends_at">,
  now = new Date(),
): boolean {
  const end = event.ends_at
    ? Date.parse(event.ends_at)
    : Date.parse(event.starts_at) + 4 * 3_600_000;
  return Number.isFinite(end) && end <= now.getTime();
}

// No age cutoff: uploading moments to an older event must still produce a recap.
export function selectAutoRecapCandidates(
  events: AutoRecapEventRow[],
  now: Date,
): AutoRecapEventRow[] {
  return events.filter(
    (event) => isRecapEventPublic(event) && hasEventEnded(event, now),
  );
}

type SkipReason =
  | "not_found"
  | "private"
  | "not_ended"
  | "awaiting_media"
  | "too_few_captioned"
  | "already_queued"
  | "retry_exhausted";
export type EnqueueRecapResult =
  | {
      outcome: "enqueued";
      stats: {
        eligibleMoments: number;
        photoCount: number;
        videoCount: number;
      };
    }
  | { outcome: "skipped"; reason: SkipReason; eligibleMoments?: number }
  | { outcome: "error"; message: string };

type RecapInput =
  | {
      outcome: "ready";
      prompt: string;
      stats: {
        eligibleMoments: number;
        photoCount: number;
        videoCount: number;
      };
    }
  | Exclude<EnqueueRecapResult, { outcome: "enqueued" }>;

/** Reused at completion: late uploads and privacy changes cannot publish stale evidence. */
export async function prepareRecapInput(
  admin: SupabaseClient,
  eventId: string,
  now = new Date(),
): Promise<RecapInput> {
  const { data: event, error } = await admin
    .from("events")
    .select(
      "id, title, slug, status, description, location_name, starts_at, ends_at, ai_tags, has_private_details, tribe_id, tribe_visibility, organizers(name), venues(name)",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error)
    return { outcome: "error", message: `event fetch: ${error.message}` };
  if (!event) return { outcome: "skipped", reason: "not_found" };
  if (!isRecapEventPublic(event))
    return { outcome: "skipped", reason: "private" };
  if (!hasEventEnded(event, now))
    return { outcome: "skipped", reason: "not_ended" };

  const rows: RecapMomentRow[] = [];
  let awaitingMedia = false;
  // Read ALL moments in deterministic order, never silently omit everything after 50.
  for (let offset = 0; ; offset += 500) {
    const { data, error: momentsError } = await admin
      .from("moments")
      .select(
        "id, content_type, created_at, moment_metadata(processing_status, ai_description, ai_title, scene_description, mood, detected_objects, ai_tags, video_summary, audio_summary, video_transcript, audio_transcript)",
      )
      .eq("event_id", eventId)
      .eq("status", "published")
      .in("content_type", ["photo", "video", "audio", "image"])
      .order("created_at")
      .order("id")
      .range(offset, offset + 499);
    if (momentsError)
      return {
        outcome: "error",
        message: `moments fetch: ${momentsError.message}`,
      };
    for (const moment of data ?? []) {
      const meta =
        moment.moment_metadata as unknown as Partial<RecapMomentRow> | null;
      if (now.getTime() - Date.parse(moment.created_at) < UPLOAD_QUIET_MS)
        awaitingMedia = true;
      if (
        meta?.processing_status !== "skipped" &&
        (meta?.processing_status !== "completed" ||
          !meta.ai_description?.trim())
      )
        awaitingMedia = true;
      if (
        meta?.processing_status === "completed" &&
        ((moment.content_type === "video" && meta.video_transcript == null) ||
          (moment.content_type === "audio" && meta.audio_transcript == null))
      )
        awaitingMedia = true;
      rows.push({
        ...meta,
        id: moment.id,
        content_type: moment.content_type,
        processing_status: meta?.processing_status ?? null,
        ai_description: meta?.ai_description ?? null,
      } as RecapMomentRow);
    }
    if (!data || data.length < 500) break;
  }
  if (awaitingMedia) return { outcome: "skipped", reason: "awaiting_media" };
  const eligible = selectRecapMoments(rows);
  if (!eligible.length)
    return {
      outcome: "skipped",
      reason: "too_few_captioned",
      eligibleMoments: 0,
    };
  const stats = {
    eligibleMoments: eligible.length,
    photoCount: eligible.filter((m) =>
      ["photo", "image"].includes(m.content_type),
    ).length,
    videoCount: eligible.filter((m) => m.content_type === "video").length,
  };
  const prompt = buildRecapPrompt({
    event,
    moments: eligible,
    venueName:
      (event.venues as unknown as { name: string } | null)?.name ?? null,
    organizerName:
      (event.organizers as unknown as { name: string } | null)?.name ?? null,
    momentCount: eligible.length,
    photoCount: stats.photoCount,
    videoCount: stats.videoCount,
  });
  return { outcome: "ready", prompt, stats };
}

/** One job per event; compare actual evidence to refresh only when it changes. */
export async function enqueueRecapJob(
  admin: SupabaseClient,
  eventId: string,
  opts: { replace?: boolean } = {},
): Promise<EnqueueRecapResult> {
  const input = await prepareRecapInput(admin, eventId);
  if (input.outcome !== "ready") return input;
  const { data: existing, error: lookupError } = await admin
    .from("caption_jobs")
    .select("id, status, prompt, prompt_version, retry_rounds, completed_at")
    .eq("event_id", eventId)
    .eq("content_type", "recap")
    .maybeSingle();
  if (lookupError) return { outcome: "error", message: lookupError.message };
  const changed =
    existing &&
    (existing.prompt !== input.prompt ||
      existing.prompt_version !== RECAP_PROMPT_VERSION);
  if (existing) {
    if (["pending", "processing"].includes(existing.status))
      return { outcome: "skipped", reason: "already_queued" };
    if (!changed && !opts.replace) {
      if (existing.status === "done")
        return { outcome: "skipped", reason: "already_queued" };
      if ((existing.retry_rounds ?? 0) >= MAX_RETRY_ROUNDS)
        return { outcome: "skipped", reason: "retry_exhausted" };
      if (
        existing.completed_at &&
        Date.now() - Date.parse(existing.completed_at) < RETRY_AFTER_MS
      )
        return { outcome: "skipped", reason: "already_queued" };
    }
  }
  const payload = {
    prompt: input.prompt,
    prompt_version: RECAP_PROMPT_VERSION,
    status: "pending",
    attempts: 0,
    retry_rounds:
      changed || opts.replace ? 0 : (existing?.retry_rounds ?? -1) + 1,
    claimed_at: null,
    completed_at: null,
    error: null,
    result: null,
  };
  const query = existing
    ? admin
        .from("caption_jobs")
        .update({ ...payload, id: randomUUID() })
        .eq("id", existing.id)
        .eq("status", existing.status)
        .select("id")
    : admin
        .from("caption_jobs")
        .insert({
          ...payload,
          content_type: "recap",
          event_id: eventId,
          moment_id: null,
          media_urls: [],
        })
        .select("id");
  const { data, error: saveError } = await query;
  if (saveError)
    return saveError.code === "23505"
      ? { outcome: "skipped", reason: "already_queued" }
      : { outcome: "error", message: saveError.message };
  if (!data?.length) return { outcome: "skipped", reason: "already_queued" };
  return { outcome: "enqueued", stats: input.stats };
}
