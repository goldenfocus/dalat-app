/**
 * Cinema Mode Transition System
 *
 * Handles smooth transitions between moments (photos and videos).
 * Different transitions are used based on content type changes.
 */

import type { MomentContentType } from "@/lib/types";

export type TransitionType = "crossfade" | "fade-black" | "zoom-blur" | "slide-push";

export interface TransitionConfig {
  type: TransitionType;
  duration: number;
  easing: string;
}

/**
 * Select appropriate transition based on content types
 *
 * @param fromType - Content type of the outgoing moment
 * @param toType - Content type of the incoming moment
 * @returns Transition configuration
 */
export function selectTransition(
  fromType: MomentContentType | null,
  toType: MomentContentType | null
): TransitionConfig {
  const fromIsVideo = fromType === "video";
  const toIsVideo = toType === "video";

  // Video -> Photo: Use fade-black for clean separation
  if (fromIsVideo && !toIsVideo) {
    return {
      type: "fade-black",
      duration: 600,
      easing: "ease-in-out",
    };
  }

  // Photo -> Video: Use zoom-blur for dramatic entry
  if (!fromIsVideo && toIsVideo) {
    return {
      type: "zoom-blur",
      duration: 500,
      easing: "ease-out",
    };
  }

  // Photo -> Photo: Crossfade (90%) or slide-push (10%) for variety
  if (!fromIsVideo && !toIsVideo) {
    if (Math.random() > 0.9) {
      return {
        type: "slide-push",
        duration: 700,
        easing: "ease-in-out",
      };
    }
  }

  // Default: crossfade
  return {
    type: "crossfade",
    duration: 800,
    easing: "ease-in-out",
  };
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
