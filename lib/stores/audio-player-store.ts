import { create } from "zustand";
import type { Locale } from "@/lib/types";
import type { KaraokeLevel } from "@/lib/types/karaoke";
import { DEFAULT_LYRICS_OFFSET, DEFAULT_KARAOKE_LEVEL } from "@/lib/types/karaoke";

export interface AudioTrack {
  id: string;
  file_url: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  // Karaoke data (optional)
  lyrics_lrc?: string | null;
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

  // Audio element (singleton, stored in state)
  audioElement: HTMLAudioElement | null;

  // Playback state
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;

  // Playback modes
  repeatMode: RepeatMode;
  shuffle: boolean;
  shuffledIndices: number[];

  // UI state
  isVisible: boolean;

  // Karaoke state
  karaokeLevel: KaraokeLevel;
  karaokeEnabled: boolean;
  lyricsOffset: number;
  showTranslation: boolean;
  translationLocale: Locale;

  // Actions
  setAudioElement: (element: HTMLAudioElement | null) => void;
  setPlaylist: (tracks: AudioTrack[], playlist: PlaylistInfo, startIndex?: number) => void;
  playTrack: (index: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  close: () => void;

  // Karaoke actions
  setKaraokeLevel: (level: KaraokeLevel) => void;
  toggleKaraoke: () => void;
  setLyricsOffset: (offset: number) => void;
  adjustLyricsOffset: (delta: number) => void;
  toggleTranslation: () => void;
  setTranslationLocale: (locale: Locale) => void;
}

// Fisher-Yates shuffle to create random order
function createShuffledIndices(length: number, startIndex: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
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
  audioElement: null,
  isPlaying: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  repeatMode: "all",
  shuffle: false,
  shuffledIndices: [],
  isVisible: false,

  // Karaoke initial state
  karaokeLevel: DEFAULT_KARAOKE_LEVEL,
  karaokeEnabled: true,
  lyricsOffset: DEFAULT_LYRICS_OFFSET,
  showTranslation: true,
  translationLocale: "en" as Locale,

  // Store the audio element reference
  setAudioElement: (element) => {
    set({ audioElement: element });
  },

  // Set a new playlist and optionally start playing
  setPlaylist: (tracks, playlist, startIndex = 0) => {
    const { audioElement } = get();

    set({
      tracks,
      playlist,
      currentIndex: startIndex,
      currentTime: 0,
      duration: 0,
      isVisible: true,
      shuffledIndices: createShuffledIndices(tracks.length, startIndex),
    });

    // Load the track
    const track = tracks[startIndex];
    if (audioElement && track) {
      audioElement.src = track.file_url;
      audioElement.load();
    }

    // Auto-play
    setTimeout(() => {
      get().play();
    }, 100);
  },

  // Play a specific track by index
  playTrack: (index) => {
    const { tracks, audioElement } = get();
    if (index < 0 || index >= tracks.length) return;

    const track = tracks[index];
    set({
      currentIndex: index,
      currentTime: 0,
      duration: 0,
    });

    if (audioElement && track) {
      audioElement.src = track.file_url;
      audioElement.load();
    }

    // Auto-play after setting track
    setTimeout(() => {
      get().play();
    }, 100);
  },

  // Play
  play: async () => {
    const { audioElement, tracks, currentIndex } = get();
    const track = tracks[currentIndex];

    if (!audioElement || !track) return;

    try {
      set({ isLoading: true });

      // Ensure correct source is set
      if (!audioElement.src || !audioElement.src.includes(track.file_url.split('/').pop() || '')) {
        audioElement.src = track.file_url;
        audioElement.load();
      }

      // Wait for audio to be ready if needed
      if (audioElement.readyState < 3) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Audio load timeout')), 10000);

          const onCanPlay = () => {
            clearTimeout(timeout);
            audioElement.removeEventListener('canplaythrough', onCanPlay);
            audioElement.removeEventListener('error', onError);
            resolve();
          };

          const onError = (e: Event) => {
            clearTimeout(timeout);
            audioElement.removeEventListener('canplaythrough', onCanPlay);
            audioElement.removeEventListener('error', onError);
            reject(e);
          };

          audioElement.addEventListener('canplaythrough', onCanPlay);
          audioElement.addEventListener('error', onError);
        });
      }

      await audioElement.play();
      set({ isPlaying: true, isLoading: false });
    } catch (error) {
      console.error('Error playing audio:', error);
      set({ isPlaying: false, isLoading: false });
    }
  },

  // Pause
  pause: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
    }
    set({ isPlaying: false });
  },

  // Toggle play/pause
  togglePlay: () => {
    const { isPlaying, play, pause } = get();
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  },

  // Next track
  next: () => {
    const { currentIndex, tracks, shuffle, shuffledIndices, repeatMode, playTrack } = get();

    let nextIndex: number;

    if (shuffle) {
      const currentShufflePos = shuffledIndices.indexOf(currentIndex);
      if (currentShufflePos < shuffledIndices.length - 1) {
        nextIndex = shuffledIndices[currentShufflePos + 1];
      } else if (repeatMode === "all") {
        nextIndex = shuffledIndices[0];
      } else {
        return; // No more tracks
      }
    } else if (currentIndex < tracks.length - 1) {
      nextIndex = currentIndex + 1;
    } else if (repeatMode === "all") {
      nextIndex = 0;
    } else {
      return; // No more tracks
    }

    playTrack(nextIndex);
  },

  // Previous track
  previous: () => {
    const { currentIndex, currentTime, shuffle, shuffledIndices, playTrack, audioElement } = get();

    // If more than 3 seconds in, restart current track
    if (currentTime > 3) {
      if (audioElement) {
        audioElement.currentTime = 0;
      }
      set({ currentTime: 0 });
      return;
    }

    let prevIndex: number;

    if (shuffle) {
      const currentShufflePos = shuffledIndices.indexOf(currentIndex);
      if (currentShufflePos > 0) {
        prevIndex = shuffledIndices[currentShufflePos - 1];
      } else {
        prevIndex = currentIndex; // Stay on current
      }
    } else if (currentIndex > 0) {
      prevIndex = currentIndex - 1;
    } else {
      prevIndex = 0;
    }

    playTrack(prevIndex);
  },

  // Seek to time
  seek: (time) => {
    const { audioElement, duration } = get();
    if (!audioElement || !duration || duration <= 0) return;

    if (time >= 0 && time <= duration) {
      audioElement.currentTime = time;
      set({ currentTime: time });
    }
  },

  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  // Toggle repeat mode
  toggleRepeat: () => {
    const { repeatMode } = get();
    const modes: RepeatMode[] = ["none", "all", "one"];
    const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    set({ repeatMode: nextMode });
  },

  // Toggle shuffle
  toggleShuffle: () => {
    const { shuffle, tracks, currentIndex } = get();
    if (!shuffle) {
      set({
        shuffle: true,
        shuffledIndices: createShuffledIndices(tracks.length, currentIndex),
      });
    } else {
      set({ shuffle: false });
    }
  },

  // Close player
  close: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    set({
      isVisible: false,
      isPlaying: false,
      tracks: [],
      playlist: null,
      currentIndex: 0,
      currentTime: 0,
      duration: 0,
      shuffledIndices: [],
    });
  },

  // Karaoke actions
  setKaraokeLevel: (level) => set({ karaokeLevel: level }),

  toggleKaraoke: () => {
    const { karaokeEnabled } = get();
    if (karaokeEnabled) {
      // Disable: set level to 0 (closed)
      set({ karaokeEnabled: false, karaokeLevel: 0 });
    } else {
      // Enable: restore to default level
      set({ karaokeEnabled: true, karaokeLevel: DEFAULT_KARAOKE_LEVEL });
    }
  },

  setLyricsOffset: (offset) => set({ lyricsOffset: offset }),

  adjustLyricsOffset: (delta) => {
    const { lyricsOffset } = get();
    // Clamp offset between -2000ms and +2000ms
    const newOffset = Math.max(-2000, Math.min(2000, lyricsOffset + delta));
    set({ lyricsOffset: newOffset });
  },

  toggleTranslation: () => {
    const { showTranslation } = get();
    set({ showTranslation: !showTranslation });
  },

  setTranslationLocale: (locale) => set({ translationLocale: locale }),
}));

// Selector hooks
export const useCurrentTrack = () =>
  useAudioPlayerStore((state) =>
    state.tracks.length > 0 ? state.tracks[state.currentIndex] : null
  );

export const useIsPlayerVisible = () =>
  useAudioPlayerStore((state) => state.isVisible);

export const useIsPlaying = () =>
  useAudioPlayerStore((state) => state.isPlaying);

// Karaoke selector hooks
export const useKaraokeLevel = () =>
  useAudioPlayerStore((state) => state.karaokeLevel);

export const useKaraokeEnabled = () =>
  useAudioPlayerStore((state) => state.karaokeEnabled);

export const useLyricsOffset = () =>
  useAudioPlayerStore((state) => state.lyricsOffset);

export const useShowTranslation = () =>
  useAudioPlayerStore((state) => state.showTranslation);

export const useCurrentTrackLyrics = () =>
  useAudioPlayerStore((state) => {
    const track = state.tracks.length > 0 ? state.tracks[state.currentIndex] : null;
    return track?.lyrics_lrc ?? null;
  });
