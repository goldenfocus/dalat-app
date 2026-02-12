"use client";

import { useCallback } from "react";
import { Share2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";
import { useShare } from "@/lib/hooks/use-share";

interface KaraokeShareButtonProps {
  mode: "theater" | "hero";
  className?: string;
  variant?: "icon" | "button";
}

export function KaraokeShareButton({
  mode,
  className,
  variant = "icon",
}: KaraokeShareButtonProps) {
  const { share, copied } = useShare();
  const { playlist, currentIndex, tracks } = useAudioPlayerStore();

  const getShareUrl = useCallback(() => {
    if (!playlist?.eventSlug) return null;
    const currentTrack = tracks[currentIndex];

    if (mode === "hero" && currentTrack?.id) {
      return `https://dalat.app/vi/events/${playlist.eventSlug}/karaoke/${currentTrack.id}`;
    }

    const baseUrl = `https://dalat.app/vi/events/${playlist.eventSlug}/playlist`;
    const params = new URLSearchParams();
    params.set("karaoke", mode);
    if (currentIndex > 0) {
      params.set("track", currentIndex.toString());
    }
    return `${baseUrl}?${params.toString()}`;
  }, [playlist?.eventSlug, mode, currentIndex, tracks]);

  const handleShare = () => {
    const url = getShareUrl();
    if (!url) return;
    const currentTrack = tracks[currentIndex];
    share({
      title: currentTrack?.title || "Karaoke",
      text: `🎤 Sing along to ${currentTrack?.title || "Karaoke"}`,
      url,
    });
  };

  if (!playlist?.eventSlug) return null;

  if (variant === "button") {
    return (
      <button
        onClick={handleShare}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full",
          "bg-white/10 text-white/80 hover:text-white hover:bg-white/20",
          "transition-all",
          className,
        )}
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            <span className="text-sm">Copied!</span>
          </>
        ) : (
          <>
            <Share2 className="w-4 h-4" />
            <span className="text-sm">Share</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className={cn(
        "p-3 rounded-full transition-all",
        "bg-white/10 text-white/80 hover:text-white hover:bg-white/20",
        className,
      )}
      aria-label={copied ? "Link copied!" : "Share karaoke link"}
    >
      {copied ? (
        <Check className="w-5 h-5" />
      ) : (
        <Share2 className="w-5 h-5" />
      )}
    </button>
  );
}
