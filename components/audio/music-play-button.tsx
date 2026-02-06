"use client";

import { Music } from "lucide-react";
import { useAudioPlayerStore, useHasHiddenPlaylist } from "@/lib/stores/audio-player-store";
import { Button } from "@/components/ui/button";

/**
 * A button that appears when the audio player is hidden but has a playlist.
 * Clicking it reopens the player and resumes playback.
 */
export function MusicPlayButton() {
  const hasHiddenPlaylist = useHasHiddenPlaylist();
  const show = useAudioPlayerStore((state) => state.show);
  const play = useAudioPlayerStore((state) => state.play);

  if (!hasHiddenPlaylist) {
    return null;
  }

  const handleClick = () => {
    show();
    play();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      title="Resume music"
    >
      <Music className="h-4 w-4" />
    </Button>
  );
}
