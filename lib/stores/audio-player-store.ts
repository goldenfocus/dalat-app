import { create } from "zustand";

export interface AudioTrack {
  id: string;
  file_url: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
}

export interface PlaylistInfo {
  eventSlug: string;
  eventTitle: string;
  eventImageUrl: string | null;
}

export type RepeatMode = "none" | "one" | "all";

interface AudioPlayerState {
  // Playlist
  tracks: AudioTrack[];
  playlist: PlaylistInfo | null;
  currentIndex: number;

  // Playback state
  isPlaying: boolean;
  currentTime: number;
  duration: number;

  // Playback modes
  repeatMode: RepeatMode;
  shuffle: boolean;
  shuffledIndices: number[]; // For shuffle mode - pre-computed random order

  // UI state
  isExpanded: boolean;
  isVisible: boolean;

  // Actions
  setPlaylist: (tracks: AudioTrack[], playlist: PlaylistInfo, startIndex?: number) => void;
  playTrack: (index: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  onTrackEnded: () => void; // Special handler for track end (auto-advance)
  seekTo: (time: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  expand: () => void;
  collapse: () => void;
  close: () => void;
}

// Fisher-Yates shuffle to create random order
function createShuffledIndices(length: number, startIndex: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  // Shuffle all except put startIndex first
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  // Move startIndex to front if shuffle starts mid-playlist
  const startPos = indices.indexOf(startIndex);
  if (startPos > 0) {
    [indices[0], indices[startPos]] = [indices[startPos], indices[0]];
  }
  return indices;
}

export const useAudioPlayerStore = create<AudioPlayerState>((set, get) => ({
  // Initial state
  tracks: [],
  playlist: null,
  currentIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  repeatMode: "all", // Default to loop playlist (most music players do this)
  shuffle: false,
  shuffledIndices: [],
  isExpanded: false,
  isVisible: false,

  // Set a new playlist and optionally start playing
  setPlaylist: (tracks, playlist, startIndex = 0) => {
    set({
      tracks,
      playlist,
      currentIndex: startIndex,
      currentTime: 0,
      duration: 0,
      isVisible: true,
      isPlaying: true, // Auto-play when setting playlist
      shuffledIndices: createShuffledIndices(tracks.length, startIndex),
    });
  },

  // Play a specific track by index
  playTrack: (index) => {
    const { tracks } = get();
    if (index >= 0 && index < tracks.length) {
      set({
        currentIndex: index,
        currentTime: 0,
        isPlaying: true,
      });
    }
  },

  // Playback controls
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  next: () => {
    const { currentIndex, tracks, shuffle, shuffledIndices, repeatMode } = get();
    if (shuffle) {
      const currentShufflePos = shuffledIndices.indexOf(currentIndex);
      if (currentShufflePos < shuffledIndices.length - 1) {
        set({
          currentIndex: shuffledIndices[currentShufflePos + 1],
          currentTime: 0,
        });
      } else if (repeatMode === "all") {
        // Loop back to start of shuffled order
        set({
          currentIndex: shuffledIndices[0],
          currentTime: 0,
        });
      }
    } else if (currentIndex < tracks.length - 1) {
      set({
        currentIndex: currentIndex + 1,
        currentTime: 0,
      });
    } else if (repeatMode === "all") {
      // Loop back to first track
      set({
        currentIndex: 0,
        currentTime: 0,
      });
    }
  },

  previous: () => {
    const { currentIndex, currentTime, shuffle, shuffledIndices } = get();
    // If more than 3 seconds in, restart current track
    if (currentTime > 3) {
      set({ currentTime: 0 });
    } else if (shuffle) {
      const currentShufflePos = shuffledIndices.indexOf(currentIndex);
      if (currentShufflePos > 0) {
        set({
          currentIndex: shuffledIndices[currentShufflePos - 1],
          currentTime: 0,
        });
      }
    } else if (currentIndex > 0) {
      set({
        currentIndex: currentIndex - 1,
        currentTime: 0,
      });
    }
  },

  // Called when a track naturally ends - handles repeat/loop logic
  onTrackEnded: () => {
    const { currentIndex, tracks, repeatMode, shuffle, shuffledIndices } = get();

    if (repeatMode === "one") {
      // Repeat single track - restart and keep playing
      set({ currentTime: 0, isPlaying: true });
      return;
    }

    const isLastTrack = shuffle
      ? shuffledIndices.indexOf(currentIndex) === shuffledIndices.length - 1
      : currentIndex === tracks.length - 1;

    if (isLastTrack) {
      if (repeatMode === "all") {
        // Loop playlist - go back to first track
        const nextIndex = shuffle ? shuffledIndices[0] : 0;
        set({
          currentIndex: nextIndex,
          currentTime: 0,
          isPlaying: true,
        });
      } else {
        // No repeat - stop at end
        set({ isPlaying: false });
      }
    } else {
      // More tracks - advance and keep playing
      const nextIndex = shuffle
        ? shuffledIndices[shuffledIndices.indexOf(currentIndex) + 1]
        : currentIndex + 1;
      set({
        currentIndex: nextIndex,
        currentTime: 0,
        isPlaying: true,
      });
    }
  },

  seekTo: (time) => set({ currentTime: time }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  // Playback mode controls
  toggleRepeat: () => {
    const { repeatMode } = get();
    const modes: RepeatMode[] = ["none", "all", "one"];
    const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    set({ repeatMode: nextMode });
  },

  toggleShuffle: () => {
    const { shuffle, tracks, currentIndex } = get();
    if (!shuffle) {
      // Turning shuffle ON - create new shuffled order starting from current
      set({
        shuffle: true,
        shuffledIndices: createShuffledIndices(tracks.length, currentIndex),
      });
    } else {
      set({ shuffle: false });
    }
  },

  // UI controls
  expand: () => set({ isExpanded: true }),
  collapse: () => set({ isExpanded: false }),
  close: () =>
    set({
      isVisible: false,
      isPlaying: false,
      tracks: [],
      playlist: null,
      currentIndex: 0,
      currentTime: 0,
      duration: 0,
      shuffledIndices: [],
    }),
}));

// Selector hooks for common patterns
export const useCurrentTrack = () =>
  useAudioPlayerStore((state) =>
    state.tracks.length > 0 ? state.tracks[state.currentIndex] : null
  );

export const useIsPlayerVisible = () =>
  useAudioPlayerStore((state) => state.isVisible);

export const useIsPlaying = () =>
  useAudioPlayerStore((state) => state.isPlaying);
