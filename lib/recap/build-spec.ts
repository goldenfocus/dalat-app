import type { MomentContentType, MomentStatus, MomentVideoStatus } from "@/lib/types";
import { seededIndex } from "../cinema/resolve-soundtrack";
import {
  defaultPickMotion,
  defaultPickTransition,
  type PickMotion,
  type PickTransition,
  type RecapOrientation,
} from "./defaults";
import {
  RECAP_CAPTION_MAX_CHARS,
  RECAP_CANVAS,
  RECAP_MAX_DURATION_MS,
  RECAP_MIN_DURATION_MS,
  RECAP_SPEC_VERSION,
  validateRecapSpec,
  type RecapShot,
  type RecapSoundtrack,
  type RecapSpec,
  type RecapSpecIssue,
} from "./spec";
import { computeSourceHash } from "./source-hash";

/** Bump when selection or layout rules change so old hashes stop matching. */
export const RECAP_BUILDER_VERSION = "1";

export interface RecapEventInput {
  id: string;
  slug: string;
  title: string;
  /** YYYY-MM-DD in the event's local time zone (Asia/Ho_Chi_Minh). */
  localDate: string;
  /** Optional caller-localized label for the title card; falls back to localDate. */
  localDateLabel?: string | null;
  venueName: string | null;
  canonicalUrl: string;
}

/**
 * One moment as the builder sees it. `status` is mandatory on purpose: only
 * `"published"` moments are ever used, everything else is dropped.
 * Captions are the uploader's own text (`text_content`), never AI descriptions.
 */
export interface RecapMomentInput {
  id: string;
  status: MomentStatus;
  contentType: MomentContentType;
  mediaUrl: string | null;
  cfVideoUid?: string | null;
  videoStatus?: MomentVideoStatus | null;
  videoDurationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  caption: string | null;
  sourceLocale?: string | null;
  /** Public display name only. */
  creditName: string | null;
  capturedAt?: string | null;
  createdAt: string;
  likeCount?: number | null;
  commentCount?: number | null;
  aiGenerated?: boolean;
}

export interface RecapSoundtrackInput {
  fileUrl: string;
  title: string | null;
  artist: string | null;
  isHouse: boolean;
  startOffsetMs?: number;
  bpm?: number;
  /** Beat onsets in track time (ms). */
  beatTimesMs?: readonly number[];
}

export interface RecapBuildInput {
  event: RecapEventInput;
  moments: readonly RecapMomentInput[];
  soundtrack: RecapSoundtrackInput | null;
}

export interface RecapBuildOptions {
  seed?: string;
  minMoments?: number;
  maxShots?: number;
  maxVideos?: number;
  beatToleranceMs?: number;
  pickMotion?: PickMotion;
  pickTransition?: PickTransition;
  /** Included in the source hash; bump when the injected catalogue changes. */
  catalogueVersion?: string;
}

export type RecapSkipReason =
  | { code: "too_few_moments"; eligible: number; required: number }
  | { code: "too_short"; totalDurationMs: number }
  | { code: "invalid_spec"; errors: RecapSpecIssue[] };

export type RecapBuildResult =
  | { spec: RecapSpec; reason: null }
  | { spec: null; reason: RecapSkipReason };

const DEFAULTS = { minMoments: 8, maxShots: 12, maxVideos: 4, beatToleranceMs: 250 } as const;
const TITLE_MS = { base: 2500, min: 2000, max: 3500 };
const PHOTO_MS = { base: 2500, min: 2000, max: 3000 };
const VIDEO_MS = { base: 3000, min: 2000, max: 4000 };
const END_CARD_MS = 3000;
const ENGAGEMENT_CAP = 50;

interface Range {
  base: number;
  min: number;
  max: number;
}

export interface Candidate {
  moment: RecapMomentInput;
  type: "photo" | "video";
  mediaUrl: string | null;
  streamUid: string | null;
  sourceMs: number;
  orientation: RecapOrientation;
  score: number;
  tie: number;
  time: string;
}

const isHttps = (url: string | null | undefined): url is string => {
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

const positiveInt = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;

const count = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

export function orientationOf(width: number | null | undefined, height: number | null | undefined): RecapOrientation {
  const w = positiveInt(width);
  const h = positiveInt(height);
  if (!w || !h) return "unknown";
  const ratio = w / h;
  return ratio < 0.9 ? "portrait" : ratio > 1.1 ? "landscape" : "square";
}

function cleanCaption(text: string | null): string | null {
  const collapsed = (text ?? "").replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const chars = Array.from(collapsed);
  return chars.length <= RECAP_CAPTION_MAX_CHARS ? collapsed : `${chars.slice(0, RECAP_CAPTION_MAX_CHARS - 1).join("").trimEnd()}…`;
}

const cleanCredit = (name: string | null): string | null => {
  const trimmed = (name ?? "").trim();
  return trimmed ? Array.from(trimmed).slice(0, 80).join("") : null;
};

/** Privacy gate and media gate. Anything not published with usable media is dropped. */
function toCandidate(m: RecapMomentInput, seed: string): Candidate | null {
  if (m.status !== "published") return null;
  const base = { moment: m, tie: seededIndex(`${seed}:${m.id}`, 1_000_000), time: m.capturedAt ?? m.createdAt };
  const engagement = Math.min(count(m.likeCount) + 2 * count(m.commentCount), ENGAGEMENT_CAP);
  const captionBonus = cleanCaption(m.caption) ? 3 : 0;
  if (m.contentType === "photo" || m.contentType === "image") {
    if (!isHttps(m.mediaUrl)) return null;
    return { ...base, type: "photo", mediaUrl: m.mediaUrl, streamUid: null, sourceMs: 0, orientation: orientationOf(m.width, m.height), score: engagement + captionBonus };
  }
  if (m.contentType !== "video") return null;
  const ready = m.videoStatus === undefined || m.videoStatus === null || m.videoStatus === "ready";
  const streamUid = ready && m.cfVideoUid ? m.cfVideoUid : null;
  const mediaUrl = ready && isHttps(m.mediaUrl) ? m.mediaUrl : null;
  const sourceMs = Math.round((m.videoDurationSeconds ?? 0) * 1000);
  if ((!streamUid && !mediaUrl) || sourceMs < VIDEO_MS.min) return null;
  return { ...base, type: "video", mediaUrl, streamUid, sourceMs, orientation: orientationOf(m.width, m.height), score: engagement + captionBonus + 1 };
}

export function collectCandidates(moments: readonly RecapMomentInput[], seed: string): Candidate[] {
  const byId = new Map<string, Candidate>();
  const sorted = [...moments].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const moment of sorted) {
    if (byId.has(moment.id)) continue;
    const candidate = toCandidate(moment, seed);
    if (candidate) byId.set(moment.id, candidate);
  }
  return [...byId.values()];
}

const rankCompare = (a: Candidate, b: Candidate) =>
  b.score - a.score || a.tie - b.tie || (a.moment.id < b.moment.id ? -1 : a.moment.id > b.moment.id ? 1 : 0);

const chronoCompare = (a: Candidate, b: Candidate) =>
  a.time < b.time ? -1 : a.time > b.time ? 1 : a.moment.id < b.moment.id ? -1 : a.moment.id > b.moment.id ? 1 : 0;

/** Ranked picks: top videos first (capped), photos fill the rest, spare slots go to extra videos. */
export function selectCandidates(all: readonly Candidate[], maxShots: number, maxVideos: number): Candidate[] {
  const ranked = [...all].sort(rankCompare);
  const videos = ranked.filter((c) => c.type === "video");
  const photos = ranked.filter((c) => c.type === "photo");
  const chosen = [...videos.slice(0, maxVideos)];
  chosen.push(...photos.slice(0, Math.max(0, maxShots - chosen.length)));
  if (chosen.length < maxShots) chosen.push(...videos.slice(maxVideos, maxVideos + maxShots - chosen.length));
  return chosen.sort(rankCompare);
}

function normalizeBeats(soundtrack: RecapSoundtrackInput | null): number[] {
  const offset = soundtrack?.startOffsetMs ?? 0;
  const beats = (soundtrack?.beatTimesMs ?? []).filter((b) => Number.isFinite(b) && b >= 0).map((b) => Math.round(b));
  return [...new Set(beats)].sort((a, b) => a - b).map((b) => b - offset).filter((b) => b > 0);
}

/** Nearest beat to `target` inside [lo, hi] and within tolerance; otherwise the target itself. Earlier beat wins ties. */
export function snapToBeat(target: number, beats: readonly number[], toleranceMs: number, lo: number, hi: number): number {
  let best = target;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const beat of beats) {
    if (beat < lo || beat > hi) continue;
    const distance = Math.abs(beat - target);
    if (distance <= toleranceMs && distance < bestDistance) {
      best = beat;
      bestDistance = distance;
    }
  }
  return best;
}

interface Layout {
  titleMs: number;
  durations: number[];
  totalMs: number;
}

function layoutTimeline(items: readonly Candidate[], beats: readonly number[], toleranceMs: number): Layout {
  const next = (cursor: number, range: Range, cap = Number.POSITIVE_INFINITY) => {
    const hi = Math.min(cursor + range.max, cursor + cap);
    const lo = Math.min(cursor + range.min, hi);
    return snapToBeat(Math.min(cursor + range.base, hi), beats, toleranceMs, lo, hi) - cursor;
  };
  const titleMs = next(0, TITLE_MS);
  let cursor = titleMs;
  const durations = items.map((item) => {
    const duration = item.type === "video" ? next(cursor, VIDEO_MS, item.sourceMs) : next(cursor, PHOTO_MS);
    cursor += duration;
    return duration;
  });
  return { titleMs, durations, totalMs: cursor + END_CARD_MS };
}

/** Drops the lowest-ranked shot until the cut fits the maximum duration. */
function fitToMax(selected: Candidate[], beats: readonly number[], toleranceMs: number): { items: Candidate[]; layout: Layout } {
  const items = [...selected]; // rank order, best first
  const chrono = () => [...items].sort(chronoCompare);
  let layout = layoutTimeline(chrono(), beats, toleranceMs);
  while (layout.totalMs > RECAP_MAX_DURATION_MS && items.length > 1) {
    items.pop();
    layout = layoutTimeline(chrono(), beats, toleranceMs);
  }
  return { items: chrono(), layout };
}

function buildShots(items: readonly Candidate[], layout: Layout, seed: string, opts: RecapBuildOptions): RecapShot[] {
  const pickMotion = opts.pickMotion ?? defaultPickMotion;
  const pickTransition = opts.pickTransition ?? defaultPickTransition;
  let start = layout.titleMs;
  return items.map((item, index) => {
    const m = item.moment;
    const durationMs = layout.durations[index];
    const picked = pickTransition(seed, m.id, index);
    const caption = cleanCaption(m.caption);
    const common = {
      id: m.id,
      startMs: start,
      durationMs,
      transition: { id: picked.id, durationMs: Math.max(0, Math.min(Math.round(picked.durationMs), Math.floor(durationMs / 2))) },
      caption: caption ? { text: caption, sourceLocale: m.sourceLocale ?? null } : null,
      credit: cleanCredit(m.creditName),
      aiGenerated: m.aiGenerated === true,
    };
    start += durationMs;
    if (item.type === "video") {
      const maxIn = Math.max(0, item.sourceMs - durationMs);
      const inMs = Math.floor((seededIndex(`${seed}:${m.id}:in`, 1_000_000) / 1_000_000) * maxIn);
      return { ...common, type: "video" as const, mediaUrl: item.mediaUrl, streamUid: item.streamUid, inMs, outMs: inMs + durationMs, muted: true };
    }
    return {
      ...common,
      type: "photo" as const,
      mediaUrl: item.mediaUrl as string,
      width: positiveInt(m.width),
      height: positiveInt(m.height),
      motion: pickMotion(seed, m.id, index, item.orientation),
      fit: item.orientation === "portrait" || item.orientation === "unknown" ? ("cover" as const) : ("contain-blur" as const),
    };
  });
}

function toSoundtrackBlock(s: RecapSoundtrackInput | null): RecapSoundtrack | null {
  if (!s) return null;
  const beats = (s.beatTimesMs ?? []).filter((b) => Number.isFinite(b) && b >= 0).map((b) => Math.round(b));
  const unique = [...new Set(beats)].sort((a, b) => a - b);
  return {
    fileUrl: s.fileUrl,
    title: s.title,
    artist: s.artist,
    isHouse: s.isHouse,
    startOffsetMs: Math.max(0, Math.round(s.startOffsetMs ?? 0)),
    ...(s.bpm ? { bpm: s.bpm } : {}),
    ...(unique.length > 0 ? { beatTimesMs: unique } : {}),
  };
}

/**
 * Pure and deterministic: same input and options always yield the same spec.
 * Returns `spec: null` with a typed reason when no valid recap can be made.
 */
export function buildRecapSpec(input: RecapBuildInput, options: RecapBuildOptions = {}): RecapBuildResult {
  const seed = options.seed ?? input.event.id;
  const minMoments = options.minMoments ?? DEFAULTS.minMoments;
  const maxShots = Math.max(1, options.maxShots ?? DEFAULTS.maxShots);
  const maxVideos = Math.max(0, options.maxVideos ?? DEFAULTS.maxVideos);
  const tolerance = options.beatToleranceMs ?? DEFAULTS.beatToleranceMs;

  const eligible = collectCandidates(input.moments, seed);
  if (eligible.length < minMoments) {
    return { spec: null, reason: { code: "too_few_moments", eligible: eligible.length, required: minMoments } };
  }

  const beats = normalizeBeats(input.soundtrack);
  const { items, layout } = fitToMax(selectCandidates(eligible, maxShots, maxVideos), beats, tolerance);
  if (layout.totalMs < RECAP_MIN_DURATION_MS) {
    return { spec: null, reason: { code: "too_short", totalDurationMs: layout.totalMs } };
  }

  const shots = buildShots(items, layout, seed, options);
  const aiIds = shots.filter((s) => s.aiGenerated).map((s) => s.id);
  const { event } = input;
  const subline = [event.localDateLabel?.trim() || event.localDate, event.venueName?.trim()].filter(Boolean).join(" · ");
  const soundtrack = toSoundtrackBlock(input.soundtrack);
  const lastEnd = layout.totalMs - END_CARD_MS;

  const spec = {
    specVersion: RECAP_SPEC_VERSION,
    event: { id: event.id, slug: event.slug, title: event.title, localDate: event.localDate, venueName: event.venueName, canonicalUrl: event.canonicalUrl },
    output: { ...RECAP_CANVAS, totalDurationMs: layout.totalMs },
    soundtrack,
    titleCard: { startMs: 0, durationMs: layout.titleMs, headline: event.title, subline: subline || null },
    shots,
    endCard: { startMs: lastEnd, durationMs: END_CARD_MS, headline: event.title, subline: null, ctaUrl: event.canonicalUrl },
    seed,
    disclosures: aiIds.length > 0 ? [{ kind: "ai_generated_media" as const, shotIds: aiIds }] : [],
    sourceHash: computeSourceHash(hashInputs(input, eligible, soundtrack, { seed, minMoments, maxShots, maxVideos, tolerance, catalogue: options.catalogueVersion ?? "" })),
  };

  const result = validateRecapSpec(spec);
  return result.ok ? { spec: result.spec, reason: null } : { spec: null, reason: { code: "invalid_spec", errors: result.errors } };
}

/** Everything that can change the render, normalized; unpublished moments never reach it. */
function hashInputs(input: RecapBuildInput, eligible: readonly Candidate[], soundtrack: RecapSoundtrack | null, knobs: Record<string, unknown>) {
  return {
    builder: RECAP_BUILDER_VERSION,
    spec: RECAP_SPEC_VERSION,
    event: input.event,
    moments: eligible.map((c) => ({
      id: c.moment.id,
      type: c.type,
      url: c.mediaUrl,
      uid: c.streamUid,
      sourceMs: c.sourceMs,
      w: positiveInt(c.moment.width),
      h: positiveInt(c.moment.height),
      caption: cleanCaption(c.moment.caption),
      credit: cleanCredit(c.moment.creditName),
      time: c.time,
      score: c.score,
      ai: c.moment.aiGenerated === true,
    })),
    soundtrack,
    knobs,
  };
}
