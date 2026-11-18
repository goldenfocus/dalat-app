import { seededIndex } from "../cinema/resolve-soundtrack";

/**
 * Tiny local stand-ins for the motion and transition catalogue that lives in
 * lib/cinema. The builder accepts injected pickers with these exact shapes, so
 * the real catalogue can replace these later without touching the builder.
 * Ids mirror the existing Ken Burns / transition names; they are plain strings.
 */

export type RecapOrientation = "portrait" | "landscape" | "square" | "unknown";

export type PickMotion = (seed: string, momentId: string, index: number, orientation: RecapOrientation) => string;

export interface PickedTransition {
  id: string;
  durationMs: number;
}

export type PickTransition = (seed: string, momentId: string, index: number) => PickedTransition;

const ANY_MOTION = ["zoom-in-center", "zoom-out-center", "zoom-pan-left", "zoom-pan-right", "zoom-pan-up", "zoom-pan-down", "drift-top-left", "drift-bottom-right"];
// Horizontal pans on a portrait frame crop away most of the picture.
const PORTRAIT_MOTION = ["zoom-in-center", "zoom-out-center", "zoom-pan-up", "zoom-pan-down"];
const TRANSITIONS = ["crossfade", "fade-black", "zoom-blur", "slide-push"];

export const defaultPickMotion: PickMotion = (seed, momentId, index, orientation) => {
  const pool = orientation === "portrait" ? PORTRAIT_MOTION : ANY_MOTION;
  // Offsetting by index keeps neighbouring shots from repeating the same preset.
  return pool[(seededIndex(`${seed}:${momentId}:motion`, pool.length) + index) % pool.length];
};

export const defaultPickTransition: PickTransition = (seed, momentId, index) => {
  if (index === 0) return { id: "crossfade", durationMs: 400 };
  const pool = TRANSITIONS;
  return { id: pool[(seededIndex(`${seed}:${momentId}:transition`, pool.length) + index) % pool.length], durationMs: 400 };
};
