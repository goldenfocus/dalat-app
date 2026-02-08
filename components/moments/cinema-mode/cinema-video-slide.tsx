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
  const hasStartedRef = useRef(false);

  // Track time updates and control playback in a single effect.
  // Including moment.id in deps ensures we re-run when transitioning between videos
  // (isActive/isPaused often stay the same between video moments).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive) return;

    const handleTimeUpdate = () => {
      onTimeUpdate(video.currentTime, video.duration || 0);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);

    // When the video source is ready (HLS.js loads async), retry play
    const handleCanPlay = () => {
      setIsBuffering(false);
      if (!isPaused) {
        video.muted = true;
        video.play().catch(() => {});
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);

    // Control playback: pause/resume without restarting
    if (!isPaused) {
      // Only reset to start on first play, not on resume
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        video.currentTime = 0;
      }
      video.muted = true;
      video.play().catch(() => {});
    } else {
      video.pause();
    }

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [isActive, isPaused, moment.id, onTimeUpdate]);

  // Reset on moment change
  useEffect(() => {
    hasStartedRef.current = false;
  }, [moment.id]);

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

  const videoSrc = moment.media_url;
  if (!videoSrc) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-black",
        isTransitioning && "animate-in fade-in zoom-in-95 duration-500"
      )}
    >
      <MomentVideoPlayer
        ref={videoRef}
        src={videoSrc}
        hlsSrc={moment.cf_playback_url}
        poster={moment.thumbnail_url || undefined}
        autoPlay={isActive && !isPaused}
        muted={true}
        loop={false}
        className="w-full h-full"
        onEnded={onEnded}
        hideMuteButton
        hideControls
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
