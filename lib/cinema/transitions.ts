/**
 * Cinema Mode Transition System
 *
 * Handles smooth transitions between moments (photos and videos).
 * Different transitions are used based on content type changes.
 */

import type { MomentContentType } from "@/lib/types";
import { hashToUint32 } from "./seeded-hash";

export type TransitionType = "crossfade" | "fade-black" | "zoom-blur" | "slide-push";

/**
 * PERSISTED FORMAT: transition ids are stored in recap specs. Never rename or
 * remove an id, only add new ones.
 */
export interface TransitionPreset {
  id: TransitionType;
  type: TransitionType;
  /** Total visible length of the transition in ms */
  durationMs: number;
  easing: string;
}

/** Kept as an alias for existing callers. */
export type TransitionConfig = TransitionPreset;

export const CINEMA_TRANSITIONS: Readonly<Record<TransitionType, TransitionPreset>> =
  Object.freeze({
    crossfade: { id: "crossfade", type: "crossfade", durationMs: 800, easing: "ease-in-out" },
    "fade-black": { id: "fade-black", type: "fade-black", durationMs: 600, easing: "ease-in-out" },
    "zoom-blur": { id: "zoom-blur", type: "zoom-blur", durationMs: 500, easing: "ease-out" },
    "slide-push": { id: "slide-push", type: "slide-push", durationMs: 700, easing: "ease-in-out" },
  });

/**
 * Pure, seeded transition choice from content types. Photo to photo is a
 * crossfade, except a deterministic ~10% that slide-push for variety.
 */
export function selectTransition(
  fromType: MomentContentType | null,
  toType: MomentContentType | null,
  seed: string,
  momentId: string,
  index: number,
): TransitionPreset {
  const fromIsVideo = fromType === "video";
  const toIsVideo = toType === "video";

  if (fromIsVideo && !toIsVideo) return CINEMA_TRANSITIONS["fade-black"];
  if (!fromIsVideo && toIsVideo) return CINEMA_TRANSITIONS["zoom-blur"];
  if (!fromIsVideo && !toIsVideo) {
    if (hashToUint32(`tr|${seed}|${momentId}|${index}`) % 10 === 9) {
      return CINEMA_TRANSITIONS["slide-push"];
    }
  }
  return CINEMA_TRANSITIONS.crossfade;
}

/**
 * Get CSS classes for outgoing element based on transition type
 */
export function getOutgoingClasses(transitionType: TransitionType): string {
  switch (transitionType) {
    case "crossfade":
      return "animate-cinema-crossfade-out";
    case "fade-black":
      return "animate-cinema-fade-black-out";
    case "zoom-blur":
      return "animate-cinema-zoom-blur-out";
    case "slide-push":
      return "animate-cinema-slide-out";
    default:
      return "animate-cinema-crossfade-out";
  }
}

/**
 * Get CSS classes for incoming element based on transition type
 */
export function getIncomingClasses(transitionType: TransitionType): string {
  switch (transitionType) {
    case "crossfade":
      return "animate-cinema-crossfade-in";
    case "fade-black":
      return "animate-cinema-fade-black-in";
    case "zoom-blur":
      return "animate-in fade-in duration-500";
    case "slide-push":
      return "animate-cinema-slide-in";
    default:
      return "animate-cinema-crossfade-in";
  }
}

/**
 * CSS transition styles for inline application
 */
export const TRANSITION_STYLES = {
  crossfade: {
    out: {
      animation: "cinemaCrossfadeOut 800ms ease-in-out forwards",
    },
    in: {
      animation: "cinemaCrossfadeIn 800ms ease-in-out forwards",
    },
  },
  "fade-black": {
    out: {
      animation: "cinemaFadeBlackOut 300ms ease-in forwards",
    },
    in: {
      animation: "cinemaFadeBlackIn 300ms ease-out 300ms forwards",
      opacity: 0,
    },
  },
  "zoom-blur": {
    out: {
      animation: "cinemaZoomBlurOut 500ms ease-out forwards",
    },
    in: {
      animation: "fadeIn 500ms ease-out forwards",
    },
  },
  "slide-push": {
    out: {
      animation: "cinemaSlideOut 700ms ease-in-out forwards",
    },
    in: {
      animation: "cinemaSlideIn 700ms ease-in-out forwards",
    },
  },
} as const;
