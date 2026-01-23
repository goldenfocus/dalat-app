"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useIntersectionVideo } from "@/lib/hooks/use-intersection-video";
import { triggerHaptic } from "@/lib/haptics";

interface VideoPlayerProps {
  src: string;
  isActive: boolean;
  poster?: string;
  /** Controlled mute state from parent */
  isMuted: boolean;
  /** Callback to toggle mute state */
  onMuteToggle: () => void;
}

/**
 * Autoplay video component for the feed.
 * Plays when visible and active, pauses when scrolled away.
 * Tap anywhere to toggle mute/unmute with center feedback.
 * Mute state is controlled by parent (engagement bar has the visible toggle).
 */
export function VideoPlayer({
  src,
  isActive,
  poster,
  isMuted,
  onMuteToggle,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);

  useIntersectionVideo(videoRef, isActive);

  // Sync muted prop with video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Reset loading and hint state when video source changes
  useEffect(() => {
    setIsLoading(true);
    setShowHint(true);
  }, [src]);

  // Auto-hide hint after 3 seconds
  useEffect(() => {
    if (!showHint || !isActive) return;
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, [showHint, isActive]);

  const handleTap = useCallback(() => {
    setShowHint(false);
    triggerHaptic("selection");
    onMuteToggle();

    // Show brief center feedback
    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 600);
  }, [onMuteToggle]);

  const handleLoadedData = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div className="absolute inset-0 z-10" onClick={handleTap}>
      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 animate-pulse z-0" />
      )}

      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="absolute inset-0 w-full h-full object-contain"
        muted={isMuted}
        loop
        playsInline
        preload={isActive ? "auto" : "metadata"}
        onLoadedData={handleLoadedData}
      />

      {/* Center feedback on tap */}
      {showFeedback && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="p-4 rounded-full bg-black/60 animate-in zoom-in-50 fade-in duration-150">
            {isMuted ? (
              <VolumeX className="w-10 h-10 text-white" />
            ) : (
              <Volume2 className="w-10 h-10 text-white" />
            )}
          </div>
        </div>
      )}

      {/* "Tap to unmute" hint - shows briefly on first view */}
      {isMuted && showHint && isActive && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
            <VolumeX className="w-5 h-5 text-white" />
            <span className="text-white text-sm font-medium">Tap for sound</span>
          </div>
        </div>
      )}
    </div>
  );
}
