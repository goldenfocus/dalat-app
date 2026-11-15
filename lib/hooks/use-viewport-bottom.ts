"use client";

import { useEffect, type RefObject } from "react";

/** Repair stale mobile fixed positioning without nudging or cancelling scroll. */
export function useViewportBottom(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const element = ref.current;
    const viewport = window.visualViewport;
    if (!enabled || !element || !viewport) return;
    let frame = 0;
    let inset = 0;

    const update = () => {
      frame = 0;
      if (viewport.scale !== 1 || !element.getClientRects().length) {
        inset = 0;
        element.style.removeProperty("bottom");
        return;
      }
      const visibleBottom = viewport.offsetTop + viewport.height;
      // Account for our previous correction so repeated events do not drift.
      const nextInset = Math.round(element.getBoundingClientRect().bottom + inset - visibleBottom);
      if (Math.abs(nextInset - inset) < 1) return;
      inset = nextInset;
      element.style.bottom = `${inset}px`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pageshow", schedule);
    schedule();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("pageshow", schedule);
      element.style.removeProperty("bottom");
    };
  }, [ref, enabled]);
}
