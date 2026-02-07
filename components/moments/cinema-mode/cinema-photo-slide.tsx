"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { cloudflareLoader } from "@/lib/image-cdn";
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
  const [imageReady, setImageReady] = useState(false);
  const [effect, setEffect] = useState<KenBurnsEffect | null>(null);

  // Use refs for scheduler state/callback to avoid infinite render loop.
  const schedulerStateRef = useRef(effectSchedulerState);
  const onEffectSelectedRef = useRef(onEffectSelected);
  schedulerStateRef.current = effectSchedulerState;
  onEffectSelectedRef.current = onEffectSelected;

  const hasSelectedEffectRef = useRef(false);

  // Detect orientation via preloader (needed before render for container sizing)
  useEffect(() => {
    if (!moment.media_url) return;

    const img = new window.Image();
    img.onload = () => {
      setIsVertical(img.naturalHeight > img.naturalWidth);
    };
    img.onerror = () => {
      // If preload fails, default to horizontal — the Image component
      // may still load fine through the cloudflare loader
      setIsVertical(false);
    };
    img.src = moment.media_url;
  }, [moment.media_url]);

  // Select Ken Burns effect once the actual Image component has loaded
  useEffect(() => {
    if (!imageReady || hasSelectedEffectRef.current) return;

    hasSelectedEffectRef.current = true;

    if (prefersReducedMotion()) {
      setEffect(getStaticEffect());
      return;
    }

    const state = schedulerStateRef.current || createEffectScheduler();
    const { effect: selectedEffect, newState } = selectNextEffect(state, isVertical);
    setEffect(selectedEffect);

    onEffectSelectedRef.current?.(newState);
  }, [imageReady, isVertical]);

  // Reset when moment changes
  useEffect(() => {
    hasSelectedEffectRef.current = false;
    setEffect(null);
    setImageReady(false);
  }, [moment.id]);

  if (!moment.media_url) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center overflow-hidden",
        isTransitioning && "animate-cinema-crossfade-in"
      )}
    >
      {/* Blurred background for vertical photos */}
      {isVertical && imageReady && (
        <div className="absolute inset-0">
          <Image
            loader={cloudflareLoader}
            src={moment.media_url}
            alt=""
            fill
            className="object-cover scale-110 blur-3xl opacity-30"
            aria-hidden="true"
            priority={false}
          />
        </div>
      )}

      {/* Main photo — always rendered so cloudflare URL loads immediately */}
      <div
        className={cn(
          "relative z-10 flex items-center justify-center",
          isVertical ? "max-w-[70vw] h-full" : "w-full h-full"
        )}
      >
        <Image
          loader={cloudflareLoader}
          src={moment.media_url}
          alt={moment.text_content || "Photo"}
          fill
          className={cn(
            "object-contain transition-opacity duration-300",
            imageReady ? "opacity-100" : "opacity-0",
            imageReady && "cinema-ken-burns",
            effect && isActive && !isTransitioning && "cinema-kb-active"
          )}
          style={
            effect
              ? ({
                  "--kb-start": effect.startTransform,
                  "--kb-end": effect.endTransform,
                  "--kb-duration": `${duration}ms`,
                  transformOrigin: effect.transformOrigin,
                } as React.CSSProperties)
              : undefined
          }
          priority
          onLoad={() => setImageReady(true)}
        />

        {/* Loading state */}
        {!imageReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
