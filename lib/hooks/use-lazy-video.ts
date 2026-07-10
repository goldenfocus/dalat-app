"use client";

import { RefObject, useEffect, useRef, useState } from "react";

/**
 * Lazy-loads an autoplaying cover video.
 *
 * Render the <video> with preload="none" and NO src attribute, keeping
 * muted/loop/playsInline so playback stays legal on iOS. The hook assigns
 * src and plays when the element nears the viewport (200px margin), and
 * pauses it when it scrolls away.
 *
 * Pass `eager: true` for above-the-fold hero videos: src is assigned on
 * mount (so preload="metadata" can fetch immediately) while play/pause
 * still follows visibility.
 *
 * `videoFailed` flips true when the media errors (deleted object, rotten
 * URL, unsupported codec) so callers can swap in an image fallback instead
 * of leaving a permanently blank tile.
 */
export function useLazyVideo(
  src: string | null | undefined,
  options: { eager?: boolean } = {}
): { videoRef: RefObject<HTMLVideoElement | null>; videoFailed: boolean } {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const { eager = false } = options;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let loaded = false;
    const load = () => {
      if (!loaded) {
        loaded = true;
        video.src = src;
      }
    };

    const onError = () => {
      console.warn("[useLazyVideo] video failed to load:", src, video.error);
      setVideoFailed(true);
    };
    video.addEventListener("error", onError);

    if (eager) load();

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          load();
          video.play().catch((err) => {
            // NotAllowedError (autoplay policy) and AbortError (pause during
            // fast scrolling) are routine; anything else deserves a signal
            if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
              console.warn("[useLazyVideo] video play failed:", src, err);
            }
          });
        } else {
          video.pause();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
      video.removeEventListener("error", onError);
      video.pause();
    };
  }, [src, eager]);

  return { videoRef, videoFailed };
}
