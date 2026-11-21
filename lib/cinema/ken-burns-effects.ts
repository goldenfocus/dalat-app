/**
 * Ken Burns Effects System
 *
 * Cinematic zoom and pan for photos in Cinema Mode. Motion is pure data: each
 * preset is a set of numbers, selection is a pure seeded function, and
 * `sampleKenBurns` returns the transform at any progress. The live player turns
 * a preset into CSS custom properties; a frame-by-frame renderer can sample the
 * very same numbers. No randomness and no clock live in this module.
 */

import { hashToUint32 } from "./seeded-hash";

/**
 * PERSISTED FORMAT: preset ids are stored in recap specs. Never rename or
 * remove an id, only add new ones.
 */
export interface KenBurnsPreset {
  id: string;
  /** Scale at progress 0 and 1 */
  scale0: number;
  scale1: number;
  /** Translate in percent of the element's own size, applied after scale */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Transform origin in percent of the element box */
  origin: { x: number; y: number };
  /** Photo is portrait-friendly (no horizontal pan) */
  vertical: boolean;
}

export interface KenBurnsSample {
  scale: number;
  x: number;
  y: number;
}

const p = (
  id: string,
  scale0: number,
  scale1: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  origin: { x: number; y: number },
  vertical: boolean,
): KenBurnsPreset => ({ id, scale0, scale1, x0, x1, y0, y1, origin, vertical });

const STATIC_PRESET = p("static", 1, 1, 0, 0, 0, 0, { x: 50, y: 50 }, true);

/** Selection pools. Even slide indexes draw from A, odd from B (see selectKenBurnsPresetId). */
const POOL_A: KenBurnsPreset[] = [
  p("zoom-in-center", 1, 1.15, 0, 0, 0, 0, { x: 50, y: 50 }, true),
  p("zoom-pan-up", 1.1, 1.2, 0, 0, 3, -3, { x: 50, y: 0 }, true),
  p("zoom-pan-left", 1.1, 1.2, 5, -5, 0, 0, { x: 0, y: 50 }, false),
  p("drift-top-left", 1.15, 1.05, 3, -2, 3, -2, { x: 0, y: 0 }, false),
];
const POOL_B: KenBurnsPreset[] = [
  p("zoom-out-center", 1.15, 1, 0, 0, 0, 0, { x: 50, y: 50 }, true),
  p("zoom-pan-down", 1.1, 1.2, 0, 0, -3, 3, { x: 50, y: 100 }, true),
  p("zoom-pan-right", 1.1, 1.2, -5, 5, 0, 0, { x: 100, y: 50 }, false),
  p("drift-bottom-right", 1.05, 1.15, -2, 3, -2, 3, { x: 100, y: 100 }, false),
];

/** Typed catalogue, by id, for specs to reference. Includes "static" (reduced motion). */
export const CINEMA_MOTION_PRESETS: Readonly<Record<string, KenBurnsPreset>> =
  Object.freeze(
    Object.fromEntries(
      [...POOL_A, ...POOL_B, STATIC_PRESET].map((preset) => [preset.id, preset]),
    ),
  );

/** Selectable presets (everything except "static"), in catalogue order. */
export const KEN_BURNS_PRESETS: readonly KenBurnsPreset[] = [...POOL_A, ...POOL_B];

export function getKenBurnsPreset(id: string): KenBurnsPreset {
  return CINEMA_MOTION_PRESETS[id] ?? STATIC_PRESET;
}

/**
 * Pure, seeded choice of a preset id. Same inputs always give the same id.
 * Consecutive slides never share a preset because even and odd indexes draw
 * from disjoint pools (which also alternates opposite directions). Portrait
 * photos only get vertical-friendly moves (zoom, pan up/down).
 */
export function selectKenBurnsPresetId(
  seed: string,
  momentId: string,
  index: number,
  isPortrait: boolean,
): string {
  const pool = ((index % 2) + 2) % 2 === 0 ? POOL_A : POOL_B;
  const friendly = isPortrait ? pool.filter((e) => e.vertical) : pool;
  const candidates = friendly.length > 0 ? friendly : pool;
  const h = hashToUint32(`kb|${seed}|${momentId}|${index}`);
  return candidates[h % candidates.length].id;
}

/** Numeric transform at progress 0..1 (clamped), linear like the CSS animation. */
export function sampleKenBurns(presetId: string, progress: number): KenBurnsSample {
  const e = getKenBurnsPreset(presetId);
  const t = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return {
    scale: e.scale0 + (e.scale1 - e.scale0) * t,
    x: e.x0 + (e.x1 - e.x0) * t,
    y: e.y0 + (e.y1 - e.y0) * t,
  };
}

function transformString(scale: number, x: number, y: number): string {
  return `scale(${scale}) translate(${x}%, ${y}%)`;
}

/** CSS transform string for a sample (same shape the player animates). */
export function kenBurnsTransform(s: KenBurnsSample): string {
  return transformString(s.scale, s.x, s.y);
}

/** CSS custom properties consumed by `.cinema-kb-active` plus the transform origin. */
export function kenBurnsCssVars(presetId: string): {
  "--kb-start": string;
  "--kb-end": string;
  transformOrigin: string;
} {
  const e = getKenBurnsPreset(presetId);
  return {
    "--kb-start": transformString(e.scale0, e.x0, e.y0),
    "--kb-end": transformString(e.scale1, e.x1, e.y1),
    transformOrigin: `${e.origin.x}% ${e.origin.y}%`,
  };
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Preset id used for reduced motion: no pan/zoom, crossfade only. */
export const STATIC_PRESET_ID = "static";

/**
 * Ken Burns run time. Deliberately independent of the slide timer: the timer
 * value in the store is stale during the crossfade and is rewritten on resume,
 * and changing animation-duration mid-flight makes the photo jump. A constant
 * longer than the longest slide (9s) keeps the motion continuous until the cut.
 */
export const KEN_BURNS_DURATION_MS = 10000;

/**
 * Largest aspect-ratio mismatch (photo vs viewport, always >= 1) for which a
 * photo is shown with object-cover. 1.35 means cover crops at most ~26% of the
 * photo along one axis (4:3 on a 16:9 desktop = 1.33 -> cover; 3:2 on 16:9 =
 * 1.19 -> cover; 16:9 on a 9:19.5 phone = 3.8 -> contain; 3:4 on that phone =
 * 1.6 -> contain; 9:16 on that phone = 1.2 -> cover).
 */
export const COVER_MAX_MISMATCH = 1.35;

export type PhotoFit = "cover" | "contain";

/**
 * Decide how a photo fills the viewport. "contain" means the caller should show
 * the whole photo over a blurred, darkened copy of itself.
 */
export function getPhotoFit(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number
): PhotoFit {
  if (
    !(imageWidth > 0) ||
    !(imageHeight > 0) ||
    !(viewportWidth > 0) ||
    !(viewportHeight > 0)
  ) {
    return "cover";
  }
  const ratio = imageWidth / imageHeight / (viewportWidth / viewportHeight);
  const mismatch = ratio >= 1 ? ratio : 1 / ratio;
  return mismatch <= COVER_MAX_MISMATCH ? "cover" : "contain";
}

/** Static preset (reduced motion) means: no pan/zoom, crossfade only. */
export function isStaticEffect(presetId: string | null): boolean {
  return !presetId || presetId === STATIC_PRESET_ID;
}
