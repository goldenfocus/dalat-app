import { create } from "zustand";
import type { MomentWithProfile } from "@/lib/types";

export type CinemaPlaybackState = "idle" | "playing" | "paused" | "ended";

interface CinemaModeState {
  // Core state
  isActive: boolean;
  playbackState: CinemaPlaybackState;

  // Moments
  moments: MomentWithProfile[];
  currentIndex: number;
  totalCount: number;
  hasMore: boolean;

  // Timer state (for photos)
  timerDuration: number;
  timerProgress: number;
  timerStartTime: number | null;
  timerRemaining: number | null;

  // Video state
  isVideoPlaying: boolean;
  videoDuration: number | null;
  videoCurrentTime: number;

  // Transition state
  isTransitioning: boolean;

  // Event context
  eventSlug: string | null;

  // UI state
  showControls: boolean;
  controlsTimeoutId: ReturnType<typeof setTimeout> | null;

  // Actions
  start: (
    moments: MomentWithProfile[],
    eventSlug: string,
    startIndex?: number,
    totalCount?: number,
    hasMore?: boolean
  ) => void;
  exit: () => void;
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  onVideoEnded: () => void;
  onVideoTimeUpdate: (currentTime: number, duration: number) => void;
  scheduleAdvance: () => void;
  clearTimer: () => void;
  appendMoments: (newMoments: MomentWithProfile[]) => void;
  setHasMore: (hasMore: boolean) => void;
  showControlsTemporarily: () => void;
  hideControls: () => void;
}

// Timer refs stored outside Zustand to avoid serialization issues
let timerRefs = {
  advanceTimeout: null as ReturnType<typeof setTimeout> | null,
  progressInterval: null as ReturnType<typeof setInterval> | null,
};

// Generate random duration between 3-9 seconds with bell curve (favors 5-7s)
function getRandomDuration(): number {
  const randomFactor = (Math.random() + Math.random()) / 2;
  return Math.round(3000 + 6000 * randomFactor);
}

export const useCinemaModeStore = create<CinemaModeState>((set, get) => ({
  // Initial state
  isActive: false,
  playbackState: "idle",
  moments: [],
  currentIndex: 0,
  totalCount: 0,
  hasMore: false,
  timerDuration: 0,
  timerProgress: 0,
  timerStartTime: null,
  timerRemaining: null,
  isVideoPlaying: false,
  videoDuration: null,
  videoCurrentTime: 0,
  isTransitioning: false,
  eventSlug: null,
  showControls: true,
  controlsTimeoutId: null,

  // Start cinema mode
  start: (moments, eventSlug, startIndex = 0, totalCount, hasMore = false) => {
    const { clearTimer } = get();
    clearTimer();

    set({
      isActive: true,
      playbackState: "playing",
      moments,
      currentIndex: startIndex,
      eventSlug,
      totalCount: totalCount ?? moments.length,
      hasMore,
      timerProgress: 0,
      isTransitioning: false,
      showControls: true,
    });

    // Start the slideshow
    setTimeout(() => {
      get().scheduleAdvance();
    }, 100);
  },

  // Exit cinema mode
  exit: () => {
    const { clearTimer, controlsTimeoutId } = get();
    clearTimer();

    if (controlsTimeoutId) {
      clearTimeout(controlsTimeoutId);
    }

    set({
      isActive: false,
      playbackState: "idle",
      moments: [],
      currentIndex: 0,
      totalCount: 0,
      hasMore: false,
      eventSlug: null,
      timerProgress: 0,
      timerDuration: 0,
      timerStartTime: null,
      timerRemaining: null,
      isVideoPlaying: false,
      videoDuration: null,
      videoCurrentTime: 0,
      isTransitioning: false,
      showControls: true,
      controlsTimeoutId: null,
    });
  },

  // Play (resume)
  play: () => {
    const { timerRemaining, moments, currentIndex } = get();

    set({ playbackState: "playing" });

    const currentMoment = moments[currentIndex];

    // If current moment is video, let video player handle it
    if (currentMoment?.content_type === "video") {
      return;
    }

    // Resume photo timer
    if (timerRemaining !== null && timerRemaining > 0) {
      const startTime = Date.now();

      set({
        timerStartTime: startTime,
        timerDuration: timerRemaining,
        timerRemaining: null,
      });

      // Progress updates
      timerRefs.progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / timerRemaining) * 100);
        set({ timerProgress: progress });
      }, 50);

      // Advance timer
      timerRefs.advanceTimeout = setTimeout(() => {
        if (timerRefs.progressInterval) clearInterval(timerRefs.progressInterval);
        get().next();
      }, timerRemaining);
    } else {
      get().scheduleAdvance();
    }
  },

  // Pause
  pause: () => {
    const { timerStartTime, timerDuration, clearTimer } = get();

    if (timerStartTime !== null) {
      const elapsed = Date.now() - timerStartTime;
      const remaining = Math.max(0, timerDuration - elapsed);

      clearTimer();
      set({
        playbackState: "paused",
        timerRemaining: remaining,
        timerStartTime: null,
      });
    } else {
      set({ playbackState: "paused" });
    }
  },

  // Toggle play/pause
  togglePlayback: () => {
    const { playbackState, play, pause } = get();
    if (playbackState === "playing") {
      pause();
    } else if (playbackState === "paused" || playbackState === "ended") {
      play();
    }
  },

  // Next moment
  next: () => {
    const { moments, currentIndex, hasMore, clearTimer, totalCount } = get();

    clearTimer();

    if (currentIndex < moments.length - 1) {
      set({
        currentIndex: currentIndex + 1,
        isTransitioning: true,
        timerProgress: 0,
        isVideoPlaying: false,
        videoDuration: null,
        videoCurrentTime: 0,
      });

      // End transition and schedule next advance
      setTimeout(() => {
        set({ isTransitioning: false });
        const { playbackState } = get();
        if (playbackState === "playing") {
          get().scheduleAdvance();
        }
      }, 800); // Match transition duration
    } else if (hasMore) {
      // Pause while waiting for more moments to load
      set({ playbackState: "paused" });
    } else {
      // Reached the end
      set({ playbackState: "ended" });
    }
  },

  // Previous moment
  previous: () => {
    const { currentIndex, clearTimer } = get();

    clearTimer();

    if (currentIndex > 0) {
      set({
        currentIndex: currentIndex - 1,
        isTransitioning: true,
        timerProgress: 0,
        isVideoPlaying: false,
        videoDuration: null,
        videoCurrentTime: 0,
      });

      setTimeout(() => {
        set({ isTransitioning: false });
        const { playbackState } = get();
        if (playbackState === "playing") {
          get().scheduleAdvance();
        }
      }, 800);
    }
  },

  // Go to specific index
  goTo: (index: number) => {
    const { moments, clearTimer } = get();

    if (index < 0 || index >= moments.length) return;

    clearTimer();

    set({
      currentIndex: index,
      isTransitioning: true,
      timerProgress: 0,
      playbackState: "playing",
      isVideoPlaying: false,
      videoDuration: null,
      videoCurrentTime: 0,
    });

    setTimeout(() => {
      set({ isTransitioning: false });
      get().scheduleAdvance();
    }, 800);
  },

  // Video ended callback
  onVideoEnded: () => {
    const { isActive, playbackState } = get();

    if (isActive && playbackState === "playing") {
      set({ isVideoPlaying: false });
      get().next();
    }
  },

  // Video time update callback
  onVideoTimeUpdate: (currentTime: number, duration: number) => {
    set({
      videoCurrentTime: currentTime,
      videoDuration: duration,
      timerProgress: duration > 0 ? (currentTime / duration) * 100 : 0,
    });
  },

  // Schedule auto-advance for photos
  scheduleAdvance: () => {
    const { moments, currentIndex, isActive, playbackState, clearTimer } = get();

    if (!isActive || playbackState !== "playing") return;

    const currentMoment = moments[currentIndex];

    // Videos handle their own advancement via onVideoEnded
    if (currentMoment?.content_type === "video") {
      set({ isVideoPlaying: true, timerProgress: 0 });
      return;
    }

    // Clear any existing timer
    clearTimer();

    const duration = getRandomDuration();
    const startTime = Date.now();

    set({
      timerDuration: duration,
      timerProgress: 0,
      timerStartTime: startTime,
      timerRemaining: null,
    });

    // Progress updates (every 50ms for smooth animation)
    timerRefs.progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      set({ timerProgress: progress });
    }, 50);

    // Main advance timer
    timerRefs.advanceTimeout = setTimeout(() => {
      if (timerRefs.progressInterval) {
        clearInterval(timerRefs.progressInterval);
      }
      get().next();
    }, duration);
  },

  // Clear all timers
  clearTimer: () => {
    if (timerRefs.advanceTimeout) {
      clearTimeout(timerRefs.advanceTimeout);
      timerRefs.advanceTimeout = null;
    }
    if (timerRefs.progressInterval) {
      clearInterval(timerRefs.progressInterval);
      timerRefs.progressInterval = null;
    }
    set({
      timerStartTime: null,
    });
  },

  // Append more moments (for infinite loading)
  appendMoments: (newMoments: MomentWithProfile[]) => {
    const { moments, playbackState, hasMore } = get();

    set({
      moments: [...moments, ...newMoments],
      totalCount: moments.length + newMoments.length,
    });

    // Resume if we were waiting for more
    if (playbackState === "paused" && hasMore) {
      set({ playbackState: "playing" });
      get().scheduleAdvance();
    }
  },

  // Update hasMore flag
  setHasMore: (hasMore: boolean) => {
    set({ hasMore });
  },

  // Show controls temporarily
  showControlsTemporarily: () => {
    const { controlsTimeoutId } = get();

    if (controlsTimeoutId) {
      clearTimeout(controlsTimeoutId);
    }

    const newTimeoutId = setTimeout(() => {
      set({ showControls: false, controlsTimeoutId: null });
    }, 3000);

    set({ showControls: true, controlsTimeoutId: newTimeoutId });
  },

  // Hide controls
  hideControls: () => {
    const { controlsTimeoutId } = get();

    if (controlsTimeoutId) {
      clearTimeout(controlsTimeoutId);
    }

    set({ showControls: false, controlsTimeoutId: null });
  },
}));

// Selector hooks - using primitive selectors to avoid object reference issues
export const useCinemaModeActive = () =>
  useCinemaModeStore((state) => state.isActive);

export const useCinemaPlaybackState = () =>
  useCinemaModeStore((state) => state.playbackState);

export const useCurrentCinemaMoment = () =>
  useCinemaModeStore((state) =>
    state.moments.length > 0 ? state.moments[state.currentIndex] : null
  );

// Split into primitive selectors to avoid object reference equality issues
export const useCinemaProgressValue = () =>
  useCinemaModeStore((state) => state.timerProgress);

export const useCinemaCurrentIndex = () =>
  useCinemaModeStore((state) => state.currentIndex);

export const useCinemaTotalCount = () =>
  useCinemaModeStore((state) => state.totalCount);

// Combined progress hook for convenience (stable - only updates when values actually change)
export const useCinemaProgress = () => {
  const progress = useCinemaProgressValue();
  const currentIndex = useCinemaCurrentIndex();
  const total = useCinemaTotalCount();
  return { progress, currentIndex, total };
};

// Actions are stable references - won't cause re-renders
export const useCinemaActions = () =>
  useCinemaModeStore((state) => state.start);

export const useCinemaShowControls = () =>
  useCinemaModeStore((state) => state.showControls);

export const useCinemaIsTransitioning = () =>
  useCinemaModeStore((state) => state.isTransitioning);

export const useCinemaMoments = () =>
  useCinemaModeStore((state) => state.moments);

export const useCinemaTimerDuration = () =>
  useCinemaModeStore((state) => state.timerDuration);
