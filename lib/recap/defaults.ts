import { selectKenBurnsPresetId } from "../cinema/ken-burns-effects";
import { selectTransition } from "../cinema/transitions";

/**
 * Default motion and transition pickers for the recap builder. They delegate to
 * the cinema catalogue (lib/cinema), so the in-browser player and a rendered
 * recap choose from the same persisted preset ids. The builder still accepts
 * injected pickers with these shapes.
 */

export type RecapOrientation = "portrait" | "landscape" | "square" | "unknown";

export type PickMotion = (seed: string, momentId: string, index: number, orientation: RecapOrientation) => string;

export interface PickedTransition {
  id: string;
  durationMs: number;
}

export type PickTransition = (seed: string, momentId: string, index: number) => PickedTransition;

/** Longest a transition may run inside a recap shot (shots are only 2-3 s). */
const MAX_RECAP_TRANSITION_MS = 400;

export const defaultPickMotion: PickMotion = (seed, momentId, index, orientation) =>
  selectKenBurnsPresetId(seed, momentId, index, orientation === "portrait");

export const defaultPickTransition: PickTransition = (seed, momentId, index) => {
  // Content types are not known here; photo-to-photo rules give a crossfade
  // with an occasional slide. The first shot always fades in.
  const preset = index === 0 ? selectTransition("video", "video", seed, momentId, index) : selectTransition(null, null, seed, momentId, index);
  return { id: preset.id, durationMs: Math.min(preset.durationMs, MAX_RECAP_TRANSITION_MS) };
};
