import { create } from "zustand";
import { getCinemaClosingCredits } from "@/lib/cinema/closing-credits";
import type { MomentWithProfile } from "@/lib/types";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";

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

  // One sound preference applies to the soundtrack and the clips.
  soundOn: boolean;

  // Music transport sync. `musicBaseline` is whether the soundtrack was
  // playing before cinema opened (null = not captured yet). The flag below is
  // true only when *we* paused the music because the slideshow paused, so a
  // resume brings it back but never overrides the viewer's own "music off".
  musicBaseline: boolean | null;
  musicPausedByTransport: boolean;

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
  scheduleAdvance: (transitionMs?: number) => void;
  clearTimer: () => void;
  appendMoments: (newMoments: MomentWithProfile[]) => void;
  setHasMore: (hasMore: boolean) => void;
  showControlsTemporarily: () => void;
  revealChrome: () => void;
  hideControls: () => void;
  toggleSound: () => void;
  captureMusicBaseline: () => void;
}

/** Chrome auto-hides this long after the last interaction while playing. */
export const CHROME_AUTO_HIDE_MS = 3000;
const CINEMA_TRANSITION_MS = 800;
const INITIAL_SLIDE_DELAY_MS = 100;
// Leave a little room for rendering while keeping the book photo under three seconds.
const SHORT_PHOTO_MS = 2850;

// Timer refs stored outside Zustand to avoid serialization issues
let timerRefs = {
  advanceTimeout: null as ReturnType<typeof setTimeout> | null,
  progressInterval: null as ReturnType<typeof setInterval> | null,
};

type StoreGet = () => CinemaModeState;
type StoreSet = (partial: Partial<CinemaModeState>) => void;

function resumeMusicIfTransportPaused(get: StoreGet, set: StoreSet) {
  const { musicPausedByTransport, soundOn } = get();
  if (!musicPausedByTransport) return;
  set({ musicPausedByTransport: false });
  const audio = useAudioPlayerStore.getState();
  if (soundOn && !audio.isPlaying) {
    void audio.play();
  }
}

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
  soundOn: true,
  musicBaseline: null,
  musicPausedByTransport: false,

  // Start cinema mode
  start: (moments, eventSlug, startIndex = 0, totalCount, hasMore = false) => {
    const { clearTimer, captureMusicBaseline } = get();
    clearTimer();
    captureMusicBaseline();

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
      soundOn: true,
      musicPausedByTransport: false,
    });
    get().revealChrome();

    // Start the slideshow
    setTimeout(() => {
      get().scheduleAdvance(INITIAL_SLIDE_DELAY_MS);
    }, INITIAL_SLIDE_DELAY_MS);
  },

  // Exit cinema mode
  exit: () => {
    const { clearTimer, controlsTimeoutId } = get();
    clearTimer();

    if (controlsTimeoutId) {
      clearTimeout(controlsTimeoutId);
    }

    // Hand the soundtrack back the way we found it.
    const { musicBaseline, musicPausedByTransport } = get();
    const audio = useAudioPlayerStore.getState();
    if (musicBaseline === false && (audio.isPlaying || audio.isLoading || audio.autoplayBlocked)) {
      audio.pause();
    } else if (musicBaseline === true && musicPausedByTransport && !audio.isPlaying) {
      void audio.play();
    }

    set({
      musicBaseline: null,
      musicPausedByTransport: false,
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
    resumeMusicIfTransportPaused(get, set);
    get().revealChrome();

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
    const { timerStartTime, timerDuration, clearTimer, controlsTimeoutId } = get();

    // One transport: pausing the slides pauses the soundtrack too.
    const audio = useAudioPlayerStore.getState();
    if (audio.isPlaying || audio.isLoading || audio.autoplayBlocked) {
      audio.pause();
      set({ musicPausedByTransport: true });
    }
    // Paused means chrome stays up until playback resumes.
    if (controlsTimeoutId) clearTimeout(controlsTimeoutId);
    set({ showControls: true, controlsTimeoutId: null });

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
    const { moments, currentIndex, hasMore, clearTimer, totalCount: _totalCount } = get();

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
          get().scheduleAdvance(CINEMA_TRANSITION_MS);
        }
      }, CINEMA_TRANSITION_MS);
    } else if (hasMore) {
      // Pause while waiting for more moments to load
      set({ playbackState: "paused" });
    } else {
      // Reached the end — show the end card with CTAs
      set({
        playbackState: "ended",
        timerProgress: 0,
        isVideoPlaying: false,
        videoDuration: null,
        videoCurrentTime: 0,
      });
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
          get().scheduleAdvance(CINEMA_TRANSITION_MS);
        }
      }, CINEMA_TRANSITION_MS);
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
    resumeMusicIfTransportPaused(get, set);

    setTimeout(() => {
      set({ isTransitioning: false });
      get().scheduleAdvance(CINEMA_TRANSITION_MS);
    }, CINEMA_TRANSITION_MS);
    get().revealChrome();
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
  scheduleAdvance: (transitionMs = 0) => {
    const { moments, currentIndex, isActive, playbackState, eventSlug, clearTimer } = get();

    if (!isActive || playbackState !== "playing") return;

    const currentMoment = moments[currentIndex];

    // Videos handle their own advancement via onVideoEnded
    if (currentMoment?.content_type === "video") {
      set({ isVideoPlaying: true, timerProgress: 0 });
      return;
    }

    // Clear any existing timer
    clearTimer();

    const credits = getCinemaClosingCredits(eventSlug);
    const duration = credits && currentMoment?.id === credits.shortPhotoId
      ? SHORT_PHOTO_MS - transitionMs
      : getRandomDuration();
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
      // Keep the real totalCount from the database — don't overwrite with loaded count
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

  // Reveal every control at once. While playing they auto-hide after
  // CHROME_AUTO_HIDE_MS of no interaction; while paused they stay put.
  revealChrome: () => {
    const { controlsTimeoutId } = get();
    if (controlsTimeoutId) clearTimeout(controlsTimeoutId);

    const shouldAutoHide = get().playbackState === "playing";
    const newTimeoutId = shouldAutoHide
      ? setTimeout(() => {
          if (get().playbackState === "playing") {
            set({ showControls: false, controlsTimeoutId: null });
          }
        }, CHROME_AUTO_HIDE_MS)
      : null;

    set({ showControls: true, controlsTimeoutId: newTimeoutId });
  },

  // Back-compat alias for the older name
  showControlsTemporarily: () => {
    get().revealChrome();
  },

  toggleSound: () => {
    const soundOn = !get().soundOn;
    set({ soundOn });
    const audio = useAudioPlayerStore.getState();
    if (!soundOn && (audio.isPlaying || audio.isLoading || audio.autoplayBlocked)) {
      audio.pause();
    }
  },

  // Remember whether music was already playing before cinema opened
  // (first caller wins, so openCinema() can capture before it starts music).
  captureMusicBaseline: () => {
    if (get().musicBaseline === null) {
      set({ musicBaseline: useAudioPlayerStore.getState().isPlaying });
    }
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

export const useCinemaSoundOn = () =>
  useCinemaModeStore((state) => state.soundOn);

/** True only while playing with chrome auto-hidden (immersive). */
export const useCinemaChromeHidden = () =>
  useCinemaModeStore((state) => state.playbackState === "playing" && !state.showControls);
