"use client";

import { Music2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/haptics";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";
import { useCinemaModeStore } from "@/lib/stores/cinema-mode-store";

/** Current soundtrack title, or null when there is no track to show. */
function useCurrentTrackTitle(): { hasTrack: boolean; title: string | null } {
  const hasTrack = useAudioPlayerStore((s) => s.tracks.length > 0);
  const title = useAudioPlayerStore((s) => s.tracks[s.currentIndex]?.title ?? null);
  return { hasTrack, title };
}

/**
 * Music chip: a musical note plus the track title. Turns the soundtrack on
 * or off without touching the slides — deliberately a different shape and
 * icon from the speaker, which only mutes a video clip's own audio.
 * Renders nothing when there is no track.
 */
export function CinemaMusicChip({ className }: { className?: string }) {
  const t = useTranslations("moments.cinemaControls");
  const { hasTrack, title } = useCurrentTrackTitle();
  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);

  if (!hasTrack) return null;

  const label = title ?? t("musicUntitled");

  return (
    <button
      type="button"
      data-cinema-audio-control
      onClick={(e) => {
        e.stopPropagation();
        triggerHaptic("selection");
        useCinemaModeStore.getState().toggleMusic();
      }}
      aria-pressed={isPlaying}
      aria-label={`${isPlaying ? t("musicTurnOff") : t("musicTurnOn")}: ${label}`}
      className={cn(
        "flex min-h-11 max-w-full items-center gap-2 rounded-full bg-black/40 pl-3 pr-4 backdrop-blur-sm",
        "text-sm font-medium text-white/90 transition-all hover:bg-black/60 active:scale-95 motion-reduce:transition-none",
        !isPlaying && "text-white/60",
        className,
      )}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
        <Music2 className="h-5 w-5" />
        {!isPlaying && (
          <span className="absolute left-0 top-1/2 h-0.5 w-5 -rotate-45 rounded-full bg-white/80" />
        )}
      </span>
      <span className={cn("truncate", !isPlaying && "line-through decoration-white/40")}>{label}</span>
    </button>
  );
}

/**
 * Screen-reader announcement for track changes. Lives outside the chrome so it
 * keeps working while the visual controls are hidden.
 */
export function CinemaTrackAnnouncer() {
  const t = useTranslations("moments.cinemaControls");
  const { title } = useCurrentTrackTitle();
  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const message = title && isPlaying ? t("nowPlaying", { title }) : "";

  return (
    <div aria-live="polite" role="status" className="sr-only">
      {message}
    </div>
  );
}
