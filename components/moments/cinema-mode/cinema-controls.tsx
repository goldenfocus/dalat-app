"use client";

import { useCallback } from "react";
import { Share2, Check, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/haptics";
import { useShare } from "@/lib/hooks/use-share";
import { MomentDownloadButton, InAppBrowserDownloadHint } from "@/components/moments/moment-download-button";
import {
  useCinemaModeStore,
  useCinemaProgressValue,
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
}

export function CinemaControls({
  eventSlug,
  eventTitle,
  onExit,
}: CinemaControlsProps) {
  const progress = useCinemaProgressValue();
  const currentIndex = useCinemaCurrentIndex();
  const total = useCinemaTotalCount();
  const playbackState = useCinemaPlaybackState();
  const showControls = useCinemaShowControls();
  const currentMoment = useCurrentCinemaMoment();
  const soundOn = useCinemaSoundOn();
  const hasVideo = useCinemaModeStore((state) =>
    state.moments.some((m) => m.content_type === "video")
  );
  const { share: nativeShare, copied: shared } = useShare();

  const goTo = useCinemaModeStore.getState().goTo;

  const isPaused = playbackState === "paused";

  const handleSegmentClick = (index: number) => {
    triggerHaptic("selection");
    goTo(index);
  };

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const momentId = currentMoment?.id;
    const shareUrl = momentId
      ? `${window.location.origin}/events/${eventSlug}/moments/${momentId}`
      : `${window.location.origin}/events/${eventSlug}/moments?view=cinema`;
    nativeShare({ title: eventTitle ?? "Moment", url: shareUrl });
  }, [eventSlug, eventTitle, currentMoment, nativeShare]);

  // Generate timeline segments
  const segments = Array.from({ length: total }, (_, i) => ({
    index: i,
    isCompleted: i < currentIndex,
    isCurrent: i === currentIndex,
    isUpcoming: i > currentIndex,
  }));

  return (
    <div
      className={cn(
        "absolute inset-0 z-30 pointer-events-none transition-opacity duration-300",
        (showControls || isPaused) ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Top bar — counter + share (view mode switcher is a separate persistent component) */}
      <div className="absolute top-0 left-0 right-0 p-4 pointer-events-auto flex items-center justify-between">
        <div className="text-white/80 text-sm font-medium px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-sm w-fit">
          {currentIndex + 1} / {total}
        </div>

        {/* Download + share. The right margin clears the persistent view-mode
            switcher, so both buttons share one wrapper rather than each
            carrying their own offset. */}
        <div className="flex items-center gap-2 mr-[180px]">
          {/* Video sound toggle — only when the slideshow contains videos */}
          {hasVideo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic("selection");
                useCinemaModeStore.getState().toggleSound();
              }}
              className="p-2.5 rounded-full bg-black/30 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/50 active:scale-95 transition-all"
              aria-label={soundOn ? "Mute videos" : "Unmute videos"}
            >
              {soundOn ? (
                <Volume2 className="w-5 h-5" />
              ) : (
                <VolumeX className="w-5 h-5" />
              )}
            </button>
          )}

          {currentMoment && (
            <MomentDownloadButton
              moment={currentMoment}
              variant="dark"
              className="!p-2.5 !bg-black/30 backdrop-blur-sm !text-white/80 hover:!bg-black/50"
            />
          )}

          {/* Share button */}
          <button
            onClick={handleShare}
            className="p-2.5 rounded-full bg-black/30 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/50 active:scale-95 transition-all"
            aria-label="Share cinema"
          >
            {shared ? (
              <Check className="w-5 h-5 text-green-400" />
            ) : (
              <Share2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Standing note for in-app browsers — quiet, not an error */}
      <div className="absolute top-16 left-0 right-0 px-4 pointer-events-none">
        <InAppBrowserDownloadHint tone="overlay" className="text-center" />
      </div>

      {/* Bottom timeline — tall touch target, thin visual bar */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-safe pointer-events-auto">
        <div className="flex gap-0.5 items-end">
          {segments.map((segment) => (
            <button
              key={segment.index}
              onClick={(e) => {
                e.stopPropagation();
                handleSegmentClick(segment.index);
              }}
              className="relative flex-1 py-4 group"
              aria-label={`Go to moment ${segment.index + 1}`}
            >
              {/* Visual bar (thin) */}
              <div
                className={cn(
                  "relative h-1 rounded-full overflow-hidden transition-colors",
                  segment.isUpcoming && "bg-white/20",
                  segment.isCompleted && "bg-primary",
                  segment.isCurrent && "bg-white/20"
                )}
              >
                {segment.isCurrent && (
                  <div
                    className="absolute inset-0 bg-primary origin-left transition-transform"
                    style={{
                      transform: `scaleX(${progress / 100})`,
                    }}
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
