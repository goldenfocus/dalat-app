"use client";

import { useRef, useEffect, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { MomentVideoPlayer } from "../moment-video-player";
import { getCfStreamPlaybackUrl } from "@/lib/media-utils";
import { requestVideoPlayback } from "@/lib/cinema/video-playback";
import { useCinemaSoundOn } from "@/lib/stores/cinema-mode-store";
import { MomentWatermark } from "@/components/moments/moment-watermark";
import { MomentCaptionOverlay } from "@/components/moments/moment-caption-overlay";
import type { MomentWithProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CinemaVideoSlideProps {
  moment: MomentWithProfile;
  isActive: boolean;
  isTransitioning: boolean;
  isPaused: boolean;
  onRequestPlay: () => void;
  onEnded: () => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
}

export function CinemaVideoSlide({
  moment,
  isActive,
  isTransitioning,
  isPaused,
  onRequestPlay,
  onEnded,
  onTimeUpdate,
}: CinemaVideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const hasStartedRef = useRef(false);
  const soundOn = useCinemaSoundOn();

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
    const handlePlaying = () => {
      setIsBuffering(false);
      setIsMediaPlaying(true);
      setPlaybackFailed(false);
    };
    const handlePause = () => setIsMediaPlaying(false);

    // When the video source is ready (HLS.js loads async), retry play
    const handleCanPlay = () => {
      setIsBuffering(false);
      setIsMediaReady(true);
      if (!isPaused) {
        void requestVideoPlayback(video, soundOn).then((started) => {
          setPlaybackFailed(!started);
        });
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);
    video.addEventListener("canplay", handleCanPlay);

    // Control playback: pause/resume without restarting
    if (!isPaused) {
      // Only reset to start on first play, not on resume
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        video.currentTime = 0;
      }
      void requestVideoPlayback(video, soundOn).then((started) => {
        setPlaybackFailed(!started);
      });
    } else {
      video.pause();
    }

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [isActive, isPaused, moment.id, onTimeUpdate, soundOn]);

  const handleManualPlay = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    onRequestPlay();
    void requestVideoPlayback(video, soundOn).then((started) => {
      setPlaybackFailed(!started);
    });
  };

  // Show video processing state
  if (moment.video_status === "processing" || moment.video_status === "uploading" || moment.video_status === "error") {
    const statusLabel = moment.video_status === "uploading"
      ? "Uploading"
      : moment.video_status === "error"
        ? "Processing failed"
        : "Processing";

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
          <p className="text-white/50 text-sm">
            {statusLabel} video...
          </p>
        </div>
      </div>
    );
  }

  const hlsSrc = moment.cf_playback_url || getCfStreamPlaybackUrl(moment.cf_video_uid) || undefined;
  const videoSrc = moment.media_url || "";
  if (!videoSrc && !hlsSrc) return null;

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
        hlsSrc={hlsSrc}
        poster={moment.thumbnail_url || undefined}
        autoPlay={isActive && !isPaused}
        muted={!soundOn}
        loop={false}
        className="w-full h-full"
        onEnded={onEnded}
        hideControls
        hideMuteButton
      />

      {/* Watermark */}
      <MomentWatermark
        displayName={moment.display_name || moment.username}
        className="z-10"
      />

      {/* Buffering indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
          <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
        </div>
      )}

      {/* A real media control: only hide it after the video confirms playback. */}
      {(isPaused || playbackFailed || (!isMediaPlaying && isMediaReady)) && !isBuffering && (
        <button
          type="button"
          onClick={handleManualPlay}
          onTouchStart={(event) => event.stopPropagation()}
          className="absolute inset-0 z-30 flex items-center justify-center bg-transparent"
          aria-label="Play video"
        >
          <span className="rounded-full bg-black/55 p-5 text-white shadow-xl backdrop-blur-sm transition-transform active:scale-95">
            <Play className="h-10 w-10 translate-x-0.5 fill-current" />
          </span>
        </button>
      )}

      {/* Caption — film-subtitle style */}
      {moment.text_content && (
        <MomentCaptionOverlay variant="subtitle" text={moment.text_content} />
      )}
    </div>
  );
}
