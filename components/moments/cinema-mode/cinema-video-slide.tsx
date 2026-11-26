"use client";
import { useTranslations } from "next-intl";
import { useVideoStatus } from "@/lib/hooks/use-video-status";

import { useRef, useEffect, useState } from "react";
import { Loader2, Play, AlertCircle } from "lucide-react";
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
  onSoundBlocked: (momentId: string | null) => void;
  onEnded: () => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
}

export function CinemaVideoSlide({
  moment: initialMoment,
  isActive,
  isTransitioning,
  isPaused,
  onRequestPlay,
  onSoundBlocked,
  onEnded,
  onTimeUpdate,
}: CinemaVideoSlideProps) {
  const t = useTranslations("moments");
  const moment = useVideoStatus(initialMoment, isActive);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const hasStartedRef = useRef(false);
  const soundOn = useCinemaSoundOn();

  useEffect(() => {
    hasStartedRef.current = false;
    setPlaybackFailed(false);
    setIsBuffering(false);
  }, [moment.id]);

  // Track time updates and control playback in a single effect.
  // Including moment.id in deps ensures we re-run when transitioning between videos
  // (isActive/isPaused often stay the same between video moments).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive) return;

    video.volume = 0.5;
    let starting = false;
    let retryWhenReady = false;
    let cancelled = false;
    const startPlayback = async () => {
      if (starting) { retryWhenReady = true; return; }
      if (!video.paused) return;
      starting = true;
      const started = await requestVideoPlayback(video, soundOn, true);
      starting = false;
      if (cancelled) return;
      if (!started && retryWhenReady && video.readyState >= 2) {
        retryWhenReady = false;
        void startPlayback();
        return;
      }
      setPlaybackFailed(!started && video.readyState >= 2);
      onSoundBlocked(started && soundOn && video.muted ? moment.id : null);
    };

    const handleTimeUpdate = () => {
      onTimeUpdate(video.currentTime, video.duration || 0);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsBuffering(false);
      setPlaybackFailed(false);
    };

    // When the video source is ready (HLS.js loads async), retry play
    const handleCanPlay = () => {
      setIsBuffering(false);
      if (!isPaused) void startPlayback();
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
      void startPlayback();
    } else {
      video.pause();
    }

    return () => {
      cancelled = true;
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [
    isActive,
    isPaused,
    moment.id,
    moment.video_status,
    onTimeUpdate,
    onSoundBlocked,
    soundOn,
  ]);

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
  if (
    moment.video_status === "processing" ||
    moment.video_status === "uploading" ||
    moment.video_status === "error"
  ) {
    const statusLabel =
      moment.video_status === "uploading"
        ? t("videoUploading")
        : moment.video_status === "error"
          ? t("videoProcessingFailed")
          : t("videoProcessing");

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          {moment.video_status === "error" ? (
            <AlertCircle className="w-8 h-8 text-white/50" />
          ) : (
            <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
          )}
          <p className="text-white/50 text-sm">{statusLabel}</p>
        </div>
      </div>
    );
  }

  const hlsSrc =
    moment.cf_playback_url ||
    getCfStreamPlaybackUrl(moment.cf_video_uid) ||
    undefined;
  const videoSrc = moment.media_url || "";
  if (!videoSrc && !hlsSrc) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-black",
        isTransitioning && "animate-in fade-in zoom-in-95 duration-500",
      )}
    >
      <MomentVideoPlayer
        ref={videoRef}
        src={videoSrc}
        hlsSrc={hlsSrc}
        poster={moment.thumbnail_url || undefined}
        controlledPlayback
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
      {(isPaused || playbackFailed) &&
        !isBuffering && (
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
        <MomentCaptionOverlay
          variant="subtitle"
          text={moment.text_content}
          contentId={moment.id}
        />
      )}
    </div>
  );
}
