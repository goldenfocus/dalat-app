"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/haptics";
import {
  useCinemaModeStore,
  useCinemaCurrentIndex,
  useCinemaProgressValue,
  useCinemaTotalCount,
} from "@/lib/stores/cinema-mode-store";

/** Above this many items, per-item segments get too thin to read or tap. */
export const SEGMENTED_PROGRESS_MAX = 30;

/**
 * Stories-style segmented progress for small albums (each segment jumps to
 * its moment); one continuous bar for big albums, whose counter is shown by
 * the controls. Isolated here so the 20Hz progress tick re-renders only this.
 */
export function CinemaProgress() {
  const t = useTranslations("moments.cinemaControls");
  const progress = useCinemaProgressValue();
  const currentIndex = useCinemaCurrentIndex();
  const total = useCinemaTotalCount();

  if (total <= 0) return null;

  if (total > SEGMENTED_PROGRESS_MAX) {
    const fraction = Math.min(1, (currentIndex + progress / 100) / total);
    return (
      <div
        role="progressbar"
        aria-label={t("progressLabel")}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={currentIndex + 1}
        className="py-5"
      >
        <div className="h-1 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full origin-left rounded-full bg-primary"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div role="group" aria-label={t("progressLabel")} className="flex items-end gap-0.5">
      {Array.from({ length: total }, (_, index) => {
        const isCurrent = index === currentIndex;
        return (
          <button
            key={index}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              useCinemaModeStore.getState().goTo(index);
            }}
            className="relative flex-1 py-5"
            aria-label={t("goToMoment", { number: index + 1 })}
            aria-current={isCurrent ? "step" : undefined}
          >
            <div
              className={cn(
                "relative h-1 overflow-hidden rounded-full",
                index < currentIndex ? "bg-primary" : "bg-white/25",
              )}
            >
              {isCurrent && (
                <div
                  className="absolute inset-0 origin-left bg-primary"
                  style={{ transform: `scaleX(${progress / 100})` }}
                />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
