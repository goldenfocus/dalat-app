"use client";

import { useEffect } from "react";

/**
 * iOS WebKit bug workaround: in standalone (PWA) mode, after the software
 * keyboard dismisses or a video exits native fullscreen, position:fixed
 * chrome (mobile bottom nav, audio mini player) stays anchored to a stale
 * visual viewport and floats mid-screen until the user scrolls.
 *
 * When the visual viewport settles back, an invisible 1px scroll round-trip
 * forces WebKit to re-anchor fixed elements to the real viewport.
 */
export function IosViewportAnchor() {
  useEffect(() => {
    const ua = window.navigator.userAgent;
    const isIos =
      /iPhone|iPad|iPod/.test(ua) ||
      // iPadOS reports itself as Macintosh but is the only "Mac" with touch
      (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
    if (!isIos) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const nudge = () => {
      clearTimeout(timer);
      // Wait for WebKit to finish its own viewport animation, then re-anchor.
      timer = setTimeout(() => {
        const x = window.scrollX;
        const y = window.scrollY;
        window.scrollTo(x, y + 1);
        window.scrollTo(x, y);
      }, 250);
    };

    const vv = window.visualViewport;
    // Keyboard open/close resizes the visual viewport
    vv?.addEventListener("resize", nudge);
    // Keyboard dismissal via input blur (covers cases resize misses)
    document.addEventListener("focusout", nudge);
    // Exiting native video fullscreen; webkitendfullscreen fires on the
    // <video> element and doesn't bubble, so listen in the capture phase
    document.addEventListener("webkitendfullscreen", nudge, true);
    document.addEventListener("fullscreenchange", nudge);

    return () => {
      clearTimeout(timer);
      vv?.removeEventListener("resize", nudge);
      document.removeEventListener("focusout", nudge);
      document.removeEventListener("webkitendfullscreen", nudge, true);
      document.removeEventListener("fullscreenchange", nudge);
    };
  }, []);

  return null;
}
