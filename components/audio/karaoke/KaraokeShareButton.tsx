"use client";

import { useState, useEffect, useCallback } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";

interface KaraokeShareButtonProps {
  mode: "theater" | "hero";
  className?: string;
  variant?: "icon" | "button";
}

/**
 * Share button for karaoke modes.
 * Generates a shareable URL with karaoke mode and track params.
 */
export function KaraokeShareButton({
  mode,
  className,
  variant = "icon",
}: KaraokeShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const { playlist, currentIndex, tracks } = useAudioPlayerStore();

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const getShareUrl = useCallback(() => {
    if (!playlist?.eventSlug) return null;

    // Build URL with karaoke mode and track
    const baseUrl = `https://dalat.app/vi/events/${playlist.eventSlug}/playlist`;
    const params = new URLSearchParams();
    params.set("karaoke", mode);
    if (currentIndex > 0) {
      params.set("track", currentIndex.toString());
    }
    return `${baseUrl}?${params.toString()}`;
  }, [playlist?.eventSlug, mode, currentIndex]);

  const handleShare = async () => {
    const url = getShareUrl();
    if (!url) return;

    const currentTrack = tracks[currentIndex];
    const title = currentTrack?.title || "Karaoke";
    const text = `🎤 Sing along to ${title}`;

    if (canShare) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
        return;
      } catch {
        // User cancelled or failed - fall through to copy
      }
    }

    // Copy to clipboard
    await copyToClipboard(url);
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
          className
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
        className
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
