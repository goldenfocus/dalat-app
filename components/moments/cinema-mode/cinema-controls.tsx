"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Share2,
  Check,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/haptics";
import { useShare } from "@/lib/hooks/use-share";
import { MomentDownloadButton, InAppBrowserDownloadHint } from "@/components/moments/moment-download-button";
import { CinemaMusicChip } from "./cinema-music-chip";
import { CinemaProgress, SEGMENTED_PROGRESS_MAX } from "./cinema-progress";
import {
  useCinemaModeStore,
  useCinemaCurrentIndex,
  useCinemaTotalCount,
  useCinemaPlaybackState,
  useCinemaShowControls,
  useCurrentCinemaMoment,
  useCinemaSoundOn,
} from "@/lib/stores/cinema-mode-store";

interface CinemaControlsProps {
  eventSlug: string;
  eventTitle?: string;
  onExit: () => void;
  /** Leave the slideshow for the grid, scrolled to the current moment. */
  onShowGallery: (momentId?: string) => void;
  /** Where focus goes when the chrome hides while it holds focus. */
  focusFallbackRef: React.RefObject<HTMLElement | null>;
}

const roundButton =
  "flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/40 text-white/90 " +
  "backdrop-blur-sm transition-all hover:bg-black/60 hover:text-white active:scale-95 motion-reduce:transition-none";

/**
 * Every control in one place, revealed together by one tap: close, counter
 * (big albums), music chip, sound toggle, download, share, previous / play /
 * next, gallery and progress. Hidden while playing; visible while paused.
 */
export function CinemaControls({
  eventSlug,
  eventTitle,
  onExit,
  onShowGallery,
  focusFallbackRef,
}: CinemaControlsProps) {
  const t = useTranslations("moments.cinemaControls");
  const currentIndex = useCinemaCurrentIndex();
  const total = useCinemaTotalCount();
  const playbackState = useCinemaPlaybackState();
  const visible = useCinemaShowControls();
  const currentMoment = useCurrentCinemaMoment();
  const soundOn = useCinemaSoundOn();
  const hasVideo = useCinemaModeStore((state) =>
    state.moments.some((m) => m.content_type === "video")
  );
  const { share: nativeShare, copied: shared } = useShare();
  const containerRef = useRef<HTMLDivElement>(null);

  const isPlaying = playbackState === "playing";

  // When the chrome hides while holding focus, hand focus back to the slideshow
  // so keyboard users are never stranded on an invisible button.
  useEffect(() => {
    if (visible) return;
    const active = document.activeElement;
    if (active && containerRef.current?.contains(active)) {
      focusFallbackRef.current?.focus();
    }
  }, [visible, focusFallbackRef]);

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const momentId = currentMoment?.id;
    const shareUrl = momentId
      ? `${window.location.origin}/events/${eventSlug}/moments/${momentId}`
      : `${window.location.origin}/events/${eventSlug}/moments?view=cinema`;
    nativeShare({ title: eventTitle ?? "Moment", url: shareUrl });
  }, [eventSlug, eventTitle, currentMoment, nativeShare]);

  // Any press inside the chrome restarts the auto-hide countdown.
  const keepAlive = useCallback(() => {
    useCinemaModeStore.getState().revealChrome();
  }, []);

  const press = (action: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic("selection");
    action();
  };

  const store = useCinemaModeStore.getState();

  return (
    <div
      ref={containerRef}
      onPointerDownCapture={keepAlive}
      className={cn(
        "absolute inset-0 z-30 pointer-events-none transition-[opacity,visibility] duration-300 motion-reduce:transition-none",
        visible ? "visible opacity-100" : "invisible opacity-0"
      )}
    >
      {/* Top: close + counter (left), per-clip and share tools (right of the view-mode switcher) */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            data-cinema-audio-control
            onClick={press(onExit)}
            className={roundButton}
            aria-label={t("close")}
          >
            <X className="h-5 w-5" />
          </button>
          {total > SEGMENTED_PROGRESS_MAX && (
            <div className="rounded-full bg-black/40 px-3 py-1.5 text-sm font-medium tabular-nums text-white/90 backdrop-blur-sm">
              {t("counter", { current: currentIndex + 1, total })}
            </div>
          )}
        </div>
      </div>

      {/* Standing note for in-app browsers — quiet, not an error */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] px-4">
        <InAppBrowserDownloadHint tone="overlay" className="text-center" />
      </div>

      {/* Bottom stack: music + tools, transport + gallery, progress */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 px-4"
        style={{ paddingBottom: "max(var(--docked-player-clearance, 0px), env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="pointer-events-auto min-w-0 flex-1">
            <CinemaMusicChip className="max-w-[60vw]" />
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            {hasVideo && (
              <button
                type="button"
                data-cinema-audio-control
                onClick={press(() => store.toggleSound())}
                className={roundButton}
                aria-pressed={soundOn}
                aria-label={soundOn ? t("soundMute") : t("soundUnmute")}
              >
                {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </button>
            )}
            {currentMoment && (
              <MomentDownloadButton
                moment={currentMoment}
                variant="dark"
                className="!p-2.5 !min-h-11 !min-w-11 !bg-black/40 backdrop-blur-sm !text-white/90 hover:!bg-black/60"
              />
            )}
            <button type="button" onClick={handleShare} className={roundButton} aria-label={t("share")}>
              {shared ? <Check className="h-5 w-5 text-green-400" /> : <Share2 className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="pointer-events-auto justify-self-start">
            <button
              type="button"
              data-cinema-audio-control
              onClick={press(() => onShowGallery(currentMoment?.id))}
              className={cn(roundButton, "gap-2 px-4 text-sm font-medium")}
              aria-label={t("galleryAria")}
            >
              <LayoutGrid className="h-5 w-5" aria-hidden="true" />
              <span>{t("gallery")}</span>
            </button>
          </div>
          <div className="pointer-events-auto flex items-center gap-3">
            <button
              type="button"
              onClick={press(() => store.previous())}
              className={roundButton}
              aria-label={t("previous")}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              data-cinema-audio-control
              onClick={press(() => store.togglePlayback())}
              className={cn(roundButton, "min-h-14 min-w-14 bg-white/20")}
              aria-label={isPlaying ? t("pause") : t("play")}
            >
              {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="ml-0.5 h-7 w-7" />}
            </button>
            <button
              type="button"
              onClick={press(() => store.next())}
              className={roundButton}
              aria-label={t("next")}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
          <div />
        </div>

        <div className="pointer-events-auto">
          <CinemaProgress />
        </div>
      </div>
    </div>
  );
}
