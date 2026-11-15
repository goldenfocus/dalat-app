"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

type ResilientImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "onError" | "onLoad"> & {
  src: string;
  alt: string;
  /** The same image at its origin, never an unrelated placeholder. */
  fallbackSrc?: string;
};

/** Keep the server-rendered request/preload, with bounded recovery for failures. */
export function ResilientImage(props: ResilientImageProps) {
  return <ImageAttempt key={`${props.src}:${props.fallbackSrc}`} {...props} />;
}

function ImageAttempt({ src, fallbackSrc, srcSet, sizes, style, alt, ...props }: ResilientImageProps) {
  const image = useRef<HTMLImageElement>(null);
  const [attempt, setAttempt] = useState<"optimized" | "original" | "failed">("optimized");
  const [loaded, setLoaded] = useState(false);
  const currentSrc = attempt === "original" ? fallbackSrc! : src;

  const recover = () => {
    setLoaded(false);
    setAttempt((current) => current === "optimized" && fallbackSrc && fallbackSrc !== src
      ? "original"
      : "failed");
  };

  useEffect(() => {
    const element = image.current;
    if (!element || attempt === "failed") return;
    // Load/error may happen before hydration, particularly on a warm cache.
    if (element.complete) {
      if (element.naturalWidth > 0) setLoaded(true);
      else recover();
    }
    // A stalled above-the-fold optimizer must not leave a blank hero forever.
    // Lazy images have no deadline before they enter the viewport.
    if (loaded || props.loading === "lazy" || attempt !== "optimized" || !fallbackSrc || fallbackSrc === src) return;
    const timeout = window.setTimeout(recover, 8000);
    return () => window.clearTimeout(timeout);
    // The attempt is reset by the keyed wrapper when the source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, loaded, props.loading, src, fallbackSrc]);

  if (attempt === "failed") return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      ref={image}
      alt={alt}
      data-resilient-image=""
      // The head bootstrap can reveal a loaded image before hydration.
      suppressHydrationWarning
      src={currentSrc}
      srcSet={attempt === "optimized" ? srcSet : undefined}
      sizes={attempt === "optimized" ? sizes : undefined}
      // Hide the native broken-image glyph, including before hydration. The
      // request still starts in server HTML and keeps its layout/priority.
      style={{ ...style, visibility: loaded ? style?.visibility : "hidden" }}
      onLoad={() => setLoaded(true)}
      onError={recover}
    />
  );
}
