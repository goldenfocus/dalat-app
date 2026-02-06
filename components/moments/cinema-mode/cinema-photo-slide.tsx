"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { cloudflareLoader, optimizedImageUrl, imagePresets } from "@/lib/image-cdn";
import {
  KenBurnsEffect,
  selectNextEffect,
  createEffectScheduler,
  prefersReducedMotion,
  getStaticEffect,
} from "@/lib/cinema/ken-burns-effects";
import type { MomentWithProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CinemaPhotoSlideProps {
  moment: MomentWithProfile;
  duration: number;
  isActive: boolean;
  isTransitioning: boolean;
  effectSchedulerState?: ReturnType<typeof createEffectScheduler>;
  onEffectSelected?: (newState: ReturnType<typeof createEffectScheduler>) => void;
}

export function CinemaPhotoSlide({
  moment,
  duration,
  isActive,
  isTransitioning,
  effectSchedulerState,
  onEffectSelected,
}: CinemaPhotoSlideProps) {
  const [isVertical, setIsVertical] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [effect, setEffect] = useState<KenBurnsEffect | null>(null);

  const imageUrl = useMemo(() => {
    return optimizedImageUrl(moment.media_url, imagePresets.momentFullscreen);
  }, [moment.media_url]);

  // Detect image orientation
  useEffect(() => {
    if (!moment.media_url) return;

    const img = new window.Image();
    img.onload = () => {
      setIsVertical(img.naturalHeight > img.naturalWidth);
      setImageLoaded(true);
    };
    img.src = moment.media_url;
  }, [moment.media_url]);

  // Use refs for scheduler state/callback to avoid infinite render loop.
  // The effect scheduler state is updated after each selection, which would
  // re-trigger this effect if it were in the dependency array.
  const schedulerStateRef = useRef(effectSchedulerState);
  const onEffectSelectedRef = useRef(onEffectSelected);
  schedulerStateRef.current = effectSchedulerState;
  onEffectSelectedRef.current = onEffectSelected;

  // Select Ken Burns effect when becoming active
  useEffect(() => {
    if (!isActive || !imageLoaded) return;

    // Check reduced motion preference
    if (prefersReducedMotion()) {
      setEffect(getStaticEffect());
      return;
    }

    const state = schedulerStateRef.current || createEffectScheduler();
    const { effect: selectedEffect, newState } = selectNextEffect(state, isVertical);
    setEffect(selectedEffect);

    onEffectSelectedRef.current?.(newState);
  }, [isActive, imageLoaded, isVertical]);

  if (!imageUrl) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center overflow-hidden",
        isTransitioning && "animate-cinema-crossfade-in"
      )}
    >
      {/* Blurred background for vertical photos */}
      {isVertical && imageLoaded && (
        <div className="absolute inset-0">
          <Image
            loader={cloudflareLoader}
            src={moment.media_url!}
            alt=""
            fill
            className="object-cover scale-110 blur-3xl opacity-30"
            aria-hidden="true"
            priority={false}
          />
        </div>
      )}

      {/* Main photo with Ken Burns animation */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-center",
          isVertical ? "max-w-[70vw] h-full" : "w-full h-full"
        )}
      >
        {imageLoaded && effect && (
          <Image
            loader={cloudflareLoader}
            src={moment.media_url!}
            alt={moment.text_content || "Photo"}
            fill
            className={cn(
              "object-contain cinema-ken-burns",
              isActive && !isTransitioning && "cinema-kb-active"
            )}
            style={{
              "--kb-start": effect.startTransform,
              "--kb-end": effect.endTransform,
              "--kb-duration": `${duration}ms`,
              transformOrigin: effect.transformOrigin,
            } as React.CSSProperties}
            priority
            onLoad={() => setImageLoaded(true)}
          />
        )}

        {/* Loading state */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
