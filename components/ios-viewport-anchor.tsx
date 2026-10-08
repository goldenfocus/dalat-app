"use client";

import { useEffect } from "react";

/**
 * iOS WebKit bug workaround: after the software keyboard dismisses or a video
 * exits native fullscreen, position:fixed chrome (mobile bottom nav, floating
 * RSVP bar, upload button, audio mini player) can stay anchored to a stale
 * visual viewport and float mid-screen until the user scrolls.
 *
 * When the visual viewport settles back, an invisible 1px scroll round-trip
 * forces WebKit to re-anchor fixed elements to the real viewport.
 *
 * The round-trip must never run during an ordinary scroll. In Safari the
 * visual viewport also resizes whenever the address bar collapses or expands
 * mid-scroll; nudging then cancels momentum and makes the bottom nav jump. So:
 * - only keyboard-sized viewport changes count (the toolbar is far smaller),
 * - the nudge waits until the finger is up and scrolling has been idle.
 */
const KEYBOARD_MIN_DELTA_PX = 150;
const SETTLE_MS = 300;

export function IosViewportAnchor() {
  useEffect(() => {
    const ua = window.navigator.userAgent;
    const isIos =
      /iPhone|iPad|iPod/.test(ua) ||
      // iPadOS reports itself as Macintosh but is the only "Mac" with touch
      (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
    if (!isIos) return;

    const vv = window.visualViewport;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;
    let touching = false;
    let lastScrollAt = 0;
    let stableHeight = vv?.height ?? window.innerHeight;

    const runWhenIdle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!pending) return;
        const idleFor = Date.now() - lastScrollAt;
        if (touching || idleFor < SETTLE_MS) {
          runWhenIdle();
          return;
        }
        pending = false;
        const x = window.scrollX;
        const y = window.scrollY;
        window.scrollTo(x, y + 1);
        window.scrollTo(x, y);
      }, SETTLE_MS);
    };

    const requestNudge = () => {
      pending = true;
      runWhenIdle();
    };

    const onViewportResize = () => {
      if (!vv) return;
      const delta = Math.abs(vv.height - stableHeight);
      stableHeight = vv.height;
      // Address-bar collapse/expand is a small resize during scrolling; only a
      // keyboard opening or closing is large enough to strand fixed elements.
      if (delta >= KEYBOARD_MIN_DELTA_PX) requestNudge();
    };
    const onScroll = () => {
      lastScrollAt = Date.now();
    };
    const onTouchStart = () => {
      touching = true;
    };
    const onTouchEnd = () => {
      touching = false;
    };
    const onFocusOut = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      // Only text entry raises the keyboard.
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        requestNudge();
      }
    };

    vv?.addEventListener("resize", onViewportResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    document.addEventListener("focusout", onFocusOut);
    // Exiting native video fullscreen; webkitendfullscreen fires on the
    // <video> element and doesn't bubble, so listen in the capture phase
    document.addEventListener("webkitendfullscreen", requestNudge, true);
    document.addEventListener("fullscreenchange", requestNudge);

    return () => {
      clearTimeout(timer);
      vv?.removeEventListener("resize", onViewportResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("webkitendfullscreen", requestNudge, true);
      document.removeEventListener("fullscreenchange", requestNudge);
    };
  }, []);

  return null;
}
