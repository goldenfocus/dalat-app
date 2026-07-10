"use client";

import { useLazyVideo } from "@/lib/hooks/use-lazy-video";

interface LazyVideoCoverProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  /** Above-the-fold hero: assign src immediately */
  eager?: boolean;
  /** When true, uses preload="metadata" (hero); otherwise "none" */
  preload?: "none" | "metadata";
}

/**
 * Tiny client island for lazy autoplay cover videos.
 * Parent server cards stay free of hydration except this leaf.
 */
export function LazyVideoCover({
  src,
  className,
  style,
  eager = false,
  preload = "none",
}: LazyVideoCoverProps) {
  const { videoRef, videoFailed } = useLazyVideo(src, { eager });

  if (videoFailed) return null;

  return (
    <video
      ref={videoRef}
      className={className}
      style={style}
      muted
      loop
      playsInline
      preload={preload}
      aria-hidden="true"
    />
  );
}
