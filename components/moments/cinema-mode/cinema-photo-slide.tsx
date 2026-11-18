"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cloudflareLoader } from "@/lib/image-cdn";
import {
  KenBurnsEffect,
  KEN_BURNS_DURATION_MS,
  selectNextEffect,
  createEffectScheduler,
  prefersReducedMotion,
  getStaticEffect,
  getPhotoFit,
  isStaticEffect,
} from "@/lib/cinema/ken-burns-effects";
import { MomentWatermark } from "@/components/moments/moment-watermark";
import { MomentCaptionOverlay } from "@/components/moments/moment-caption-overlay";
import type { MomentWithProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CinemaPhotoSlideProps {
  moment: MomentWithProfile;
  /** Unused: Ken Burns has its own constant run time (see KEN_BURNS_DURATION_MS). */
  duration?: number;
  /** false while paused/ended: freezes the motion in place */
  isActive: boolean;
  isTransitioning: boolean;
  effectSchedulerState?: ReturnType<typeof createEffectScheduler>;
  onEffectSelected?: (
    newState: ReturnType<typeof createEffectScheduler>,
  ) => void;
}

/** Everything learned when a given moment's image finished loading. */
interface LoadedPhoto {
  id: string;
  width: number;
  height: number;
  effect: KenBurnsEffect;
}

function readViewport() {
  if (typeof window === "undefined") return { w: 0, h: 0 };
  return { w: window.innerWidth, h: window.innerHeight };
}

export function CinemaPhotoSlide({
  moment,
  isActive,
  isTransitioning,
  effectSchedulerState,
  onEffectSelected,
}: CinemaPhotoSlideProps) {
  // State is keyed by moment id, so a stale "loaded" flag from the previous
  // photo can never leak onto the next one (no reset effect, no race).
  const [loaded, setLoaded] = useState<LoadedPhoto | null>(null);
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!moment.media_url) return null;

  const ready = loaded?.id === moment.id;
  const effect = ready ? loaded.effect : null;
  const moving = !isStaticEffect(effect);
  const fit = ready
    ? getPhotoFit(loaded.width, loaded.height, viewport.w, viewport.h)
    : "cover";

  const handleLoad = (img: HTMLImageElement) => {
    if (loaded?.id === moment.id) return;
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    let selected = getStaticEffect();
    if (!prefersReducedMotion()) {
      const result = selectNextEffect(
        effectSchedulerState || createEffectScheduler(),
        height > width,
      );
      selected = result.effect;
      onEffectSelected?.(result.newState);
    }
    setLoaded({ id: moment.id, width, height, effect: selected });
  };

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden bg-black",
        isTransitioning && "animate-cinema-crossfade-in",
      )}
    >
      {/* Blurred, darkened copy fills the screen when the photo is shown whole */}
      {ready && fit === "contain" && (
        <Image
          loader={cloudflareLoader}
          src={moment.media_url}
          alt=""
          fill
          sizes="100vw"
          className="object-cover scale-110 blur-2xl brightness-50"
          aria-hidden="true"
          priority={false}
        />
      )}

      {/* Main photo: fills the viewport (cover) or sits whole over the blur (contain) */}
      <Image
        loader={cloudflareLoader}
        src={moment.media_url}
        alt={moment.text_content || "Photo"}
        fill
        sizes="100vw"
        className={cn(
          "z-10 transition-opacity duration-300",
          fit === "contain" ? "object-contain" : "object-cover",
          ready ? "opacity-100" : "opacity-0",
          ready && "cinema-ken-burns",
          moving && "cinema-kb-active",
        )}
        style={
          moving && effect
            ? ({
                "--kb-start": effect.startTransform,
                "--kb-end": effect.endTransform,
                "--kb-duration": `${KEN_BURNS_DURATION_MS}ms`,
                transformOrigin: effect.transformOrigin,
                animationPlayState: isActive ? "running" : "paused",
              } as React.CSSProperties)
            : undefined
        }
        priority
        onLoad={(e) => handleLoad(e.currentTarget)}
      />

      {ready && (
        <MomentWatermark
          displayName={moment.display_name || moment.username}
          className="z-20"
        />
      )}

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse" />
        </div>
      )}

      {/* Caption — film-subtitle style, crossfades with the slide */}
      {ready && moment.text_content && (
        <MomentCaptionOverlay
          variant="subtitle"
          text={moment.text_content}
          contentId={moment.id}
        />
      )}
    </div>
  );
}
