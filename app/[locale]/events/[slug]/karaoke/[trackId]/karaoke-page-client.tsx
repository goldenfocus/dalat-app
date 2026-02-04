"use client";

import { useEffect, useRef } from "react";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";
import { KaraokeHero } from "@/components/audio/karaoke";
import { MiniPlayer } from "@/components/audio/mini-player";

interface Track {
  id: string;
  title: string | null;
  artist: string | null;
  file_url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  lyrics_lrc: string | null;
}

interface KaraokePageClientProps {
  track: Track;
  event: {
    id: string;
    slug: string;
    title: string;
    image_url: string | null;
  };
  playlist: {
    id: string;
    tracks: Array<Track & { sort_order: number }>;
  };
  trackIndex: number;
  locale: string;
}

export function KaraokePageClient({
  track: _track,
  event,
  playlist,
  trackIndex,
  locale: _locale,
}: KaraokePageClientProps) {
  const hasInitialized = useRef(false);

  const { setPlaylist } = useAudioPlayerStore();

  // Initialize playlist and start in Hero mode
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Convert tracks to store format
    const audioTracks = playlist.tracks.map((t) => ({
      id: t.id,
      file_url: t.file_url,
      title: t.title,
      artist: t.artist,
      album: null,
      thumbnail_url: t.thumbnail_url,
      duration_seconds: t.duration_seconds,
      lyrics_lrc: t.lyrics_lrc,
    }));

    // Set up playlist
    setPlaylist(
      audioTracks,
      {
        eventSlug: event.slug,
        eventTitle: event.title,
        eventImageUrl: event.image_url,
      },
      trackIndex
    );

    // Enable karaoke and set to Hero mode (level 3)
    // Small delay to ensure audio element is ready
    setTimeout(() => {
      useAudioPlayerStore.setState({
        karaokeEnabled: true,
        karaokeLevel: 3,
      });
    }, 100);
  }, [setPlaylist, playlist.tracks, event, trackIndex]);

  return (
    <>
      {/* Mini player handles audio playback */}
      <MiniPlayer />

      {/* Hero mode renders as overlay when karaokeLevel is 3 */}
      <KaraokeHero />

      {/* Fallback content while loading */}
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white/60">
          <div className="text-6xl mb-4">🎤</div>
          <p className="text-xl">Loading karaoke...</p>
        </div>
      </div>
    </>
  );
}
