"use client";

import { useRef, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MomentVideoPlayer } from "../moment-video-player";
import type { MomentWithProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CinemaVideoSlideProps {
  moment: MomentWithProfile;
  isActive: boolean;
  isTransitioning: boolean;
  isPaused: boolean;
  onEnded: () => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
}

export function CinemaVideoSlide({
  moment,
  isActive,
  isTransitioning,
  isPaused,
  onEnded,
  onTimeUpdate,
}: CinemaVideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBuffering, setIsBuffering] = useState(false);

  // Video source - prefer HLS, fallback to direct URL
  const videoSrc = moment.cf_playback_url || moment.media_url;
  const isHLS = moment.cf_playback_url !== null;

  // Handle video lifecycle
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive) return;

    const handleEnded = () => onEnded();
    const handleTimeUpdate = () => {
      onTimeUpdate(video.currentTime, video.duration || 0);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleCanPlay = () => setIsBuffering(false);

    video.addEventListener("ended", handleEnded);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);

    return () => {
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [isActive, onEnded, onTimeUpdate]);

  // Control playback based on active state and pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive && !isPaused) {
      // Reset and play
      video.currentTime = 0;
      video.muted = true; // Muted because album music is playing
      video.play().catch(console.warn);
    } else if (isPaused || !isActive) {
      video.pause();
    }
  }, [isActive, isPaused]);

  // Show video processing state
  if (moment.video_status === "processing") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
          <p className="text-white/50 text-sm">Processing video...</p>
        </div>
      </div>
    );
  }

  if (!videoSrc) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-black",
        isTransitioning && "animate-in fade-in zoom-in-95 duration-500"
      )}
    >
      {/* Use the existing MomentVideoPlayer for HLS support */}
      <MomentVideoPlayer
        src={moment.media_url || ""}
        hlsSrc={moment.cf_playback_url}
        poster={moment.thumbnail_url || undefined}
        autoPlay={isActive && !isPaused}
        muted={true} // Always muted - album music is the soundtrack
        loop={false}
        className="w-full h-full"
        onEnded={onEnded}
        hideMuteButton // Cinema mode has its own audio controls
      />

      {/* Buffering indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
          <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
        </div>
      )}
    </div>
  );
}
