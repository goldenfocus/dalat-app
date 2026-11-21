"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { triggerHaptic } from "@/lib/haptics";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";
import { useCinemaSoundOn } from "@/lib/stores/cinema-mode-store";

/** One speaker control for the slideshow, whichever source is audible. */
export function CinemaSoundButton({ onToggle }: { onToggle: () => void }) {
  const t = useTranslations("moments");
  const soundOn = useCinemaSoundOn();
  const autoplayBlocked = useAudioPlayerStore((state) => state.autoplayBlocked);
  const enabled = soundOn && !autoplayBlocked;
  const label = enabled ? t("mute") : t("cinemaControls.unmute");
  const Icon = enabled ? Volume2 : VolumeX;

  return (
    <button
      type="button"
      data-cinema-audio-control
      onClick={(e) => {
        e.stopPropagation();
        triggerHaptic("selection");
        onToggle();
      }}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm transition-all hover:bg-black/60 hover:text-white active:scale-95 motion-reduce:transition-none"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/** Screen-reader announcement for the current soundtrack. */
export function CinemaTrackAnnouncer() {
  const t = useTranslations("moments.cinemaControls");
  const title = useAudioPlayerStore((state) => state.tracks[state.currentIndex]?.title ?? null);
  const isPlaying = useAudioPlayerStore((state) => state.isPlaying);
  const message = title && isPlaying ? t("nowPlaying", { title }) : "";

  return (
    <div aria-live="polite" role="status" className="sr-only">
      {message}
    </div>
  );
}
