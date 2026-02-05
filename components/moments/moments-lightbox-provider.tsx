"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { MomentLightbox, type LightboxMoment } from "./moment-lightbox";
import { useAudioPlayerStore, type AudioTrack, type PlaylistInfo } from "@/lib/stores/audio-player-store";
import { createClient } from "@/lib/supabase/client";

interface MomentsLightboxContextValue {
  openLightbox: (index: number) => void;
  closeLightbox: () => void;
  isOpen: boolean;
  currentIndex: number;
}

const MomentsLightboxContext = createContext<MomentsLightboxContextValue | null>(null);

interface MomentsLightboxProviderProps {
  children: ReactNode;
  moments: LightboxMoment[];
  eventSlug?: string;
}

/**
 * Fetch event playlist from client side and start playback
 */
async function fetchAndPlayEventPlaylist(
  eventSlug: string,
  setPlaylist: (tracks: AudioTrack[], playlist: PlaylistInfo, startIndex?: number) => void,
  currentPlaylistSlug: string | undefined
): Promise<void> {
  // Don't restart if already playing from the same event
  if (currentPlaylistSlug === eventSlug) {
    return;
  }

  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_event_playlist", {
    p_event_slug: eventSlug,
  });

  if (error || !data || data.length === 0) {
    // Event doesn't have a playlist - that's fine, just don't play anything
    return;
  }

  const firstRow = data[0];

  // Extract tracks (filter out null track_id from LEFT JOIN)
  const tracks: AudioTrack[] = data
    .filter((row: any) => row.track_id !== null)
    .map((row: any) => ({
      id: row.track_id,
      file_url: row.track_file_url,
      title: row.track_title,
      artist: row.track_artist,
      album: row.track_album,
      thumbnail_url: row.track_thumbnail_url,
      duration_seconds: row.track_duration_seconds,
      lyrics_lrc: row.track_lyrics_lrc,
      timing_offset: row.track_timing_offset || 0,
    }));

  // No tracks means no playlist to play
  if (tracks.length === 0) {
    return;
  }

  const playlistInfo: PlaylistInfo = {
    eventSlug,
    eventTitle: firstRow.event_title,
    eventImageUrl: firstRow.event_image_url,
  };

  // Start playing from the first track
  setPlaylist(tracks, playlistInfo, 0);
}

export function MomentsLightboxProvider({
  children,
  moments,
  eventSlug,
}: MomentsLightboxProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const hasTriggeredAutoPlay = useRef(false);

  // Audio player store
  const setPlaylist = useAudioPlayerStore((state) => state.setPlaylist);
  const currentPlaylist = useAudioPlayerStore((state) => state.playlist);

  const openLightbox = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Auto-play event playlist when lightbox opens
  useEffect(() => {
    if (!isOpen || !eventSlug || hasTriggeredAutoPlay.current) {
      return;
    }

    // Mark that we've triggered auto-play for this session
    hasTriggeredAutoPlay.current = true;

    // Fetch and play the event's playlist
    fetchAndPlayEventPlaylist(eventSlug, setPlaylist, currentPlaylist?.eventSlug);
  }, [isOpen, eventSlug, setPlaylist, currentPlaylist?.eventSlug]);

  // Reset auto-play flag when lightbox closes (so it can trigger again next time)
  useEffect(() => {
    if (!isOpen) {
      hasTriggeredAutoPlay.current = false;
    }
  }, [isOpen]);

  const handleIndexChange = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  return (
    <MomentsLightboxContext.Provider
      value={{ openLightbox, closeLightbox, isOpen, currentIndex }}
    >
      {children}
      <MomentLightbox
        moments={moments}
        initialIndex={currentIndex}
        isOpen={isOpen}
        onClose={closeLightbox}
        eventSlug={eventSlug}
        onIndexChange={handleIndexChange}
      />
    </MomentsLightboxContext.Provider>
  );
}

export function useMomentsLightbox() {
  const context = useContext(MomentsLightboxContext);
  if (!context) {
    throw new Error("useMomentsLightbox must be used within a MomentsLightboxProvider");
  }
  return context;
}

/**
 * Hook to get the lightbox opener for a specific moment by ID.
 * Returns null if outside provider (graceful fallback to link navigation).
 */
export function useMomentLightboxOpener(momentId: string, moments: LightboxMoment[]) {
  const context = useContext(MomentsLightboxContext);

  if (!context) {
    return null; // Graceful fallback - MomentCard will use Link navigation
  }

  const index = moments.findIndex(m => m.id === momentId);
  if (index === -1) {
    return null;
  }

  return () => context.openLightbox(index);
}
