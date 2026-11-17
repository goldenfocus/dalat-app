"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { triggerHaptic } from "@/lib/haptics";
import { useCinemaModeStore } from "@/lib/stores/cinema-mode-store";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";

const SWIPE_MIN_PX = 50;
const SWIPE_DOWN_EXIT_PX = 100;
const FLASH_MS = 600;

/** Which third of the screen a tap landed in. */
export type TapZone = "left" | "center" | "right";

export function getTapZone(clientX: number, viewportWidth: number): TapZone {
  if (viewportWidth <= 0) return "center";
  const ratio = clientX / viewportWidth;
  if (ratio < 1 / 3) return "left";
  if (ratio > 2 / 3) return "right";
  return "center";
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("button, a, input, select, textarea, [role='button']");
}

/**
 * Cinema input model: tap, swipe and keyboard.
 *  - Chrome hidden: one tap reveals everything and does nothing else.
 *  - Chrome visible: left/right thirds go previous/next, center toggles play.
 *  - Horizontal swipe navigates any time; swipe down exits.
 *  - Keys: arrows, space, escape (Tab also reveals the chrome).
 */
export function useCinemaInput(onExit: () => void) {
  const [flashIcon, setFlashIcon] = useState<"play" | "pause" | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const didSwipeRef = useRef(false);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const showFlash = useCallback((icon: "play" | "pause") => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlashIcon(icon);
    flashTimeoutRef.current = setTimeout(() => setFlashIcon(null), FLASH_MS);
  }, []);

  useEffect(() => () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
  }, []);

  const toggleTransport = useCallback(() => {
    const state = useCinemaModeStore.getState();
    showFlash(state.playbackState === "playing" ? "pause" : "play");
    triggerHaptic("selection");
    state.togglePlayback();
  }, [showFlash]);

  const handleTap = useCallback((clientX: number) => {
    const state = useCinemaModeStore.getState();

    // First user gesture unlocks music if the browser blocked autoplay.
    const audio = useAudioPlayerStore.getState();
    if (audio.autoplayBlocked && !audio.isPlaying) void audio.play();

    if (!state.showControls) {
      triggerHaptic("selection");
      state.revealChrome();
      return;
    }

    const zone = getTapZone(clientX, window.innerWidth);
    if (zone === "left") {
      triggerHaptic("selection");
      state.previous();
    } else if (zone === "right") {
      triggerHaptic("selection");
      state.next();
    } else {
      toggleTransport();
    }
    // Interaction keeps the chrome up (a no-op timer reset while paused).
    useCinemaModeStore.getState().revealChrome();
  }, [toggleTransport]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // onClick fires after touchend; ignore it when the gesture was a swipe.
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      return;
    }
    handleTap(e.clientX);
  }, [handleTap]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    didSwipeRef.current = false;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const deltaX = e.changedTouches[0].clientX - start.x;
    const deltaY = e.changedTouches[0].clientY - start.y;
    const { previous, next } = useCinemaModeStore.getState();

    if (Math.abs(deltaX) > SWIPE_MIN_PX && Math.abs(deltaX) > Math.abs(deltaY)) {
      didSwipeRef.current = true;
      triggerHaptic("selection");
      if (deltaX > 0) previous();
      else next();
    } else if (deltaY > SWIPE_DOWN_EXIT_PX && Math.abs(deltaY) > Math.abs(deltaX)) {
      didSwipeRef.current = true;
      triggerHaptic("selection");
      onExitRef.current();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { previous, next, revealChrome } = useCinemaModeStore.getState();
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onExitRef.current();
          break;
        case " ":
          // A focused button handles its own Space press.
          if (isInteractiveTarget(e.target)) return;
          e.preventDefault();
          toggleTransport();
          revealChrome();
          break;
        case "ArrowLeft":
          e.preventDefault();
          previous();
          break;
        case "ArrowRight":
          e.preventDefault();
          next();
          break;
        case "Tab":
          revealChrome();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleTransport]);

  return { flashIcon, showFlash, handleClick, handleTouchStart, handleTouchEnd };
}
