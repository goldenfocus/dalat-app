/**
 * Ken Burns Effects System
 *
 * Provides cinematic zoom and pan animations for photos in Cinema Mode.
 * Effects are designed to create visual interest without being repetitive.
 */

export interface KenBurnsEffect {
  name: string;
  startTransform: string;
  endTransform: string;
  transformOrigin: string;
}

// 8 distinct Ken Burns animation presets
export const KEN_BURNS_EFFECTS: KenBurnsEffect[] = [
  // ZOOM EFFECTS
  {
    name: "zoom-in-center",
    startTransform: "scale(1)",
    endTransform: "scale(1.15)",
    transformOrigin: "center center",
  },
  {
    name: "zoom-out-center",
    startTransform: "scale(1.15)",
    endTransform: "scale(1)",
    transformOrigin: "center center",
  },

  // PAN + ZOOM EFFECTS (the cinematic magic)
  {
    name: "zoom-pan-left",
    startTransform: "scale(1.1) translateX(5%)",
    endTransform: "scale(1.2) translateX(-5%)",
    transformOrigin: "left center",
  },
  {
    name: "zoom-pan-right",
    startTransform: "scale(1.1) translateX(-5%)",
    endTransform: "scale(1.2) translateX(5%)",
    transformOrigin: "right center",
  },
  {
    name: "zoom-pan-up",
    startTransform: "scale(1.1) translateY(3%)",
    endTransform: "scale(1.2) translateY(-3%)",
    transformOrigin: "center top",
  },
  {
    name: "zoom-pan-down",
    startTransform: "scale(1.1) translateY(-3%)",
    endTransform: "scale(1.2) translateY(3%)",
    transformOrigin: "center bottom",
  },

  // DIAGONAL MOVEMENTS (premium cinematic feel)
  {
    name: "drift-top-left",
    startTransform: "scale(1.15) translate(3%, 3%)",
    endTransform: "scale(1.05) translate(-2%, -2%)",
    transformOrigin: "top left",
  },
  {
    name: "drift-bottom-right",
    startTransform: "scale(1.05) translate(-2%, -2%)",
    endTransform: "scale(1.15) translate(3%, 3%)",
    transformOrigin: "bottom right",
  },
];

// Direction classification for alternation logic
type EffectDirection = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up" | "pan-down" | "drift";

function getEffectDirection(effectName: string): EffectDirection {
  if (effectName.includes("zoom-in")) return "zoom-in";
  if (effectName.includes("zoom-out")) return "zoom-out";
  if (effectName.includes("pan-left")) return "pan-left";
  if (effectName.includes("pan-right")) return "pan-right";
  if (effectName.includes("pan-up")) return "pan-up";
  if (effectName.includes("pan-down")) return "pan-down";
  return "drift";
}

function getOppositeDirection(direction: EffectDirection): EffectDirection | null {
  switch (direction) {
    case "zoom-in": return "zoom-out";
    case "zoom-out": return "zoom-in";
    case "pan-left": return "pan-right";
    case "pan-right": return "pan-left";
    case "pan-up": return "pan-down";
    case "pan-down": return "pan-up";
    default: return null;
  }
}

/**
 * Effect Scheduler State
 * Tracks recent effects to avoid repetition and create rhythm
 */
export interface EffectSchedulerState {
  recentEffects: string[];
  lastDirection: EffectDirection | null;
}

/**
 * Create initial scheduler state
 */
export function createEffectScheduler(): EffectSchedulerState {
  return {
    recentEffects: [],
    lastDirection: null,
  };
}

/**
 * Select the next Ken Burns effect with smart non-repetition
 *
 * @param state - Current scheduler state
 * @param isVertical - Whether the image is portrait orientation
 * @returns The selected effect and updated scheduler state
 */
export function selectNextEffect(
  state: EffectSchedulerState,
  isVertical: boolean = false
): { effect: KenBurnsEffect; newState: EffectSchedulerState } {
  // 1. Filter out recently used effects (last 4)
  const available = KEN_BURNS_EFFECTS.filter(
    (effect) => !state.recentEffects.includes(effect.name)
  );

  // 2. Prefer opposite direction to previous (creates visual rhythm)
  let preferred = available;
  if (state.lastDirection) {
    const opposite = getOppositeDirection(state.lastDirection);
    if (opposite) {
      const oppositeEffects = available.filter((effect) => {
        const dir = getEffectDirection(effect.name);
        return dir === opposite;
      });
      if (oppositeEffects.length > 0) {
        preferred = oppositeEffects;
      }
    }
  }

  // 3. For vertical photos, prefer vertical movements
  if (isVertical) {
    const verticalFriendly = preferred.filter(
      (e) =>
        e.name.includes("up") ||
        e.name.includes("down") ||
        e.name.includes("zoom-in") ||
        e.name.includes("zoom-out")
    );
    if (verticalFriendly.length > 0) {
      preferred = verticalFriendly;
    }
  }

  // 4. Random selection from filtered pool
  const pool = preferred.length > 0 ? preferred : available.length > 0 ? available : KEN_BURNS_EFFECTS;
  const selectedEffect = pool[Math.floor(Math.random() * pool.length)];

  // 5. Update scheduler state
  const newRecentEffects = [...state.recentEffects, selectedEffect.name].slice(-4);
  const newState: EffectSchedulerState = {
    recentEffects: newRecentEffects,
    lastDirection: getEffectDirection(selectedEffect.name),
  };

  return { effect: selectedEffect, newState };
}

/**
 * Pre-generate effects for a list of moments
 * Useful for consistent playback
 */
export function generateEffectSequence(
  count: number,
  verticalIndices: Set<number> = new Set()
): KenBurnsEffect[] {
  let state = createEffectScheduler();
  const effects: KenBurnsEffect[] = [];

  for (let i = 0; i < count; i++) {
    const isVertical = verticalIndices.has(i);
    const { effect, newState } = selectNextEffect(state, isVertical);
    effects.push(effect);
    state = newState;
  }

  return effects;
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Get a static effect for reduced motion preference
 */
export function getStaticEffect(): KenBurnsEffect {
  return {
    name: "static",
    startTransform: "scale(1)",
    endTransform: "scale(1)",
    transformOrigin: "center center",
  };
}
