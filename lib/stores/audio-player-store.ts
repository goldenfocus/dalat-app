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

interface AudioPlayerState {
  // Playlist
  tracks: AudioTrack[];
  playlist: PlaylistInfo | null;
  currentIndex: number;

  // Playback state
  isPlaying: boolean;
  currentTime: number;
  duration: number;

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
  seekTo: (time: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  expand: () => void;
  collapse: () => void;
  close: () => void;
}

export const useAudioPlayerStore = create<AudioPlayerState>((set, get) => ({
  // Initial state
  tracks: [],
  playlist: null,
  currentIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
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
    const { currentIndex, tracks } = get();
    if (currentIndex < tracks.length - 1) {
      set({
        currentIndex: currentIndex + 1,
        currentTime: 0,
      });
    }
  },

  previous: () => {
    const { currentIndex, currentTime } = get();
    // If more than 3 seconds in, restart current track
    if (currentTime > 3) {
      set({ currentTime: 0 });
    } else if (currentIndex > 0) {
      set({
        currentIndex: currentIndex - 1,
        currentTime: 0,
      });
    }
  },

  seekTo: (time) => set({ currentTime: time }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),

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
