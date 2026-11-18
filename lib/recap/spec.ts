import { z } from "zod";
import { SOURCE_HASH_PATTERN } from "./source-hash";

/**
 * RecapSpec v1: one JSON timeline per event that drives both the in-browser
 * cinema player and the offline MP4 render. All timings are integer ms.
 * Timeline layout: titleCard, then every shot back to back, then endCard,
 * with no gaps or overlaps. A transition into a shot plays during the first
 * `transition.durationMs` of that shot's window (the outgoing shot stays
 * visible underneath), so transitions never break the tiling.
 */

export const RECAP_SPEC_VERSION = 1 as const;
export const RECAP_CANVAS = { width: 1080, height: 1920, fps: 30 } as const;
export const RECAP_MIN_DURATION_MS = 20_000;
export const RECAP_MAX_DURATION_MS = 40_000;
export const RECAP_MAX_SHOTS = 24;
export const RECAP_CAPTION_MAX_CHARS = 90;

export type RecapIssueCode =
  | "schema"
  | "timeline_start"
  | "timeline_gap"
  | "timeline_overlap"
  | "total_mismatch"
  | "duration_out_of_bounds"
  | "duplicate_shot_id"
  | "bad_video_range"
  | "missing_video_source"
  | "transition_too_long"
  | "disclosure_unknown_shot"
  | "disclosure_missing"
  | "beats_not_increasing";

const ms = z.number().int().nonnegative();
const durationMs = z.number().int().positive();
const id = z.string().min(1).max(128);
const label = z.string().min(1).max(200);
const httpsUrl = z.string().url().max(2048).refine((u) => u.startsWith("https://"), "must be https");

const transitionSchema = z.object({
  id: z.string().min(1).max(64),
  durationMs: ms.max(2000),
});

const captionSchema = z.object({
  text: z.string().min(1).max(RECAP_CAPTION_MAX_CHARS),
  /** Locale the text was written in; renderers localize or show the original. */
  sourceLocale: z.string().min(2).max(35).nullable(),
});

const shotBase = {
  /** Stable id; equals the source moment id. */
  id,
  startMs: ms,
  durationMs,
  transition: transitionSchema,
  caption: captionSchema.nullable(),
  /** Display name of the uploader, never a username, email or id. */
  credit: z.string().min(1).max(80).nullable(),
  /** True when the media is AI-generated; must then be listed in `disclosures`. */
  aiGenerated: z.boolean(),
};

const photoShotSchema = z.object({
  ...shotBase,
  type: z.literal("photo"),
  mediaUrl: httpsUrl,
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  motion: z.string().min(1).max(64),
  fit: z.enum(["cover", "contain-blur"]),
});

const videoShotSchema = z.object({
  ...shotBase,
  type: z.literal("video"),
  mediaUrl: httpsUrl.nullable(),
  streamUid: z.string().min(1).max(64).nullable(),
  inMs: ms,
  outMs: ms,
  muted: z.boolean(),
});

export const recapShotSchema = z.discriminatedUnion("type", [photoShotSchema, videoShotSchema]);

const titleCardSchema = z.object({
  startMs: ms,
  durationMs,
  headline: label,
  subline: z.string().max(200).nullable(),
});

const endCardSchema = z.object({
  startMs: ms,
  durationMs,
  headline: label,
  subline: z.string().max(200).nullable(),
  ctaUrl: httpsUrl,
});

const soundtrackSchema = z.object({
  fileUrl: httpsUrl,
  title: z.string().max(200).nullable(),
  artist: z.string().max(200).nullable(),
  isHouse: z.boolean(),
  /** Timeline t maps to track time (t + startOffsetMs). */
  startOffsetMs: ms,
  bpm: z.number().positive().max(400).optional(),
  /** Beat onsets in TRACK time (ms from the start of the file), strictly increasing. */
  beatTimesMs: z.array(ms).max(5000).optional(),
});

const disclosureSchema = z.object({
  /** Renderers localize the visible text from the kind; no prose lives in the spec. */
  kind: z.enum(["ai_generated_media"]),
  shotIds: z.array(id),
});

export const recapSpecSchema = z
  .object({
    specVersion: z.literal(RECAP_SPEC_VERSION),
    event: z.object({
      id: z.string().min(1).max(64),
      slug: z.string().min(1).max(200),
      title: label,
      /** Local calendar date in Asia/Ho_Chi_Minh, YYYY-MM-DD. */
      localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      venueName: z.string().max(200).nullable(),
      canonicalUrl: httpsUrl,
    }),
    output: z.object({
      width: z.literal(RECAP_CANVAS.width),
      height: z.literal(RECAP_CANVAS.height),
      fps: z.literal(RECAP_CANVAS.fps),
      totalDurationMs: durationMs,
    }),
    soundtrack: soundtrackSchema.nullable(),
    titleCard: titleCardSchema,
    shots: z.array(recapShotSchema).min(1).max(RECAP_MAX_SHOTS),
    endCard: endCardSchema,
    seed: z.string().min(1).max(128),
    disclosures: z.array(disclosureSchema),
    sourceHash: z.string().regex(SOURCE_HASH_PATTERN),
  })
  .superRefine((spec, ctx) => {
    const add = (code: RecapIssueCode, message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path, params: { recapCode: code } });
    checkTiling(spec, add);
    checkShots(spec, add);
    checkDisclosures(spec, add);
    const beats = spec.soundtrack?.beatTimesMs;
    if (beats && beats.some((b, i) => i > 0 && b <= beats[i - 1])) {
      add("beats_not_increasing", "beatTimesMs must be strictly increasing", ["soundtrack", "beatTimesMs"]);
    }
  });

export type RecapSpec = z.infer<typeof recapSpecSchema>;
export type RecapShot = z.infer<typeof recapShotSchema>;
export type RecapPhotoShot = z.infer<typeof photoShotSchema>;
export type RecapVideoShot = z.infer<typeof videoShotSchema>;
export type RecapSoundtrack = z.infer<typeof soundtrackSchema>;
export type RecapDisclosure = z.infer<typeof disclosureSchema>;

type AddIssue = (code: RecapIssueCode, message: string, path: (string | number)[]) => void;

function checkTiling(spec: RecapSpec, add: AddIssue): void {
  const blocks: Array<{ start: number; dur: number; path: (string | number)[] }> = [
    { start: spec.titleCard.startMs, dur: spec.titleCard.durationMs, path: ["titleCard"] },
    ...spec.shots.map((s, i) => ({ start: s.startMs, dur: s.durationMs, path: ["shots", i] })),
    { start: spec.endCard.startMs, dur: spec.endCard.durationMs, path: ["endCard"] },
  ];
  let cursor = 0;
  blocks.forEach((block, i) => {
    if (i === 0 && block.start !== 0) add("timeline_start", "timeline must start at 0", [...block.path, "startMs"]);
    else if (i > 0 && block.start > cursor) add("timeline_gap", `gap of ${block.start - cursor} ms before this block`, [...block.path, "startMs"]);
    else if (i > 0 && block.start < cursor) add("timeline_overlap", `overlaps previous block by ${cursor - block.start} ms`, [...block.path, "startMs"]);
    cursor = block.start + block.dur;
  });
  if (cursor !== spec.output.totalDurationMs) {
    add("total_mismatch", `blocks end at ${cursor} ms but totalDurationMs is ${spec.output.totalDurationMs}`, ["output", "totalDurationMs"]);
  }
  const total = spec.output.totalDurationMs;
  if (total < RECAP_MIN_DURATION_MS || total > RECAP_MAX_DURATION_MS) {
    add("duration_out_of_bounds", `total must be ${RECAP_MIN_DURATION_MS}-${RECAP_MAX_DURATION_MS} ms`, ["output", "totalDurationMs"]);
  }
}

function checkShots(spec: RecapSpec, add: AddIssue): void {
  const seen = new Set<string>();
  spec.shots.forEach((shot, i) => {
    if (seen.has(shot.id)) add("duplicate_shot_id", `duplicate shot id ${shot.id}`, ["shots", i, "id"]);
    seen.add(shot.id);
    if (shot.transition.durationMs * 2 > shot.durationMs) {
      add("transition_too_long", "transition may use at most half of the shot", ["shots", i, "transition", "durationMs"]);
    }
    if (shot.type !== "video") return;
    if (!shot.mediaUrl && !shot.streamUid) add("missing_video_source", "video needs mediaUrl or streamUid", ["shots", i]);
    if (shot.outMs <= shot.inMs || shot.outMs - shot.inMs !== shot.durationMs) {
      add("bad_video_range", "outMs - inMs must be positive and equal durationMs", ["shots", i, "outMs"]);
    }
  });
}

function checkDisclosures(spec: RecapSpec, add: AddIssue): void {
  const ids = new Set(spec.shots.map((s) => s.id));
  const disclosed = new Set<string>();
  spec.disclosures.forEach((d, i) =>
    d.shotIds.forEach((shotId) => {
      if (!ids.has(shotId)) add("disclosure_unknown_shot", `unknown shot ${shotId}`, ["disclosures", i, "shotIds"]);
      disclosed.add(shotId);
    }),
  );
  spec.shots.forEach((shot, i) => {
    if (shot.aiGenerated && !disclosed.has(shot.id)) {
      add("disclosure_missing", "AI-generated shot must be listed in disclosures", ["shots", i, "aiGenerated"]);
    }
  });
}

export interface RecapSpecIssue {
  code: RecapIssueCode;
  /** Dotted path, e.g. `shots.3.startMs`. */
  path: string;
  message: string;
}

export type RecapValidationResult =
  | { ok: true; spec: RecapSpec }
  | { ok: false; errors: RecapSpecIssue[] };

/** Validates untrusted JSON. Never throws; returns typed issues. */
export function validateRecapSpec(input: unknown): RecapValidationResult {
  const parsed = recapSpecSchema.safeParse(input);
  if (parsed.success) return { ok: true, spec: parsed.data };
  const errors = parsed.error.issues.map((issue): RecapSpecIssue => {
    const params = (issue as { params?: { recapCode?: RecapIssueCode } }).params;
    return {
      code: params?.recapCode ?? "schema",
      path: issue.path.join("."),
      message: issue.message,
    };
  });
  return { ok: false, errors };
}
