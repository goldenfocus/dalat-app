"use client";

import { useState, useCallback } from "react";

interface ImmersiveImageProps {
  src: string;
  alt: string;
  children?: React.ReactNode;
  priority?: boolean;
}

/**
 * Renders an image with a gradient background fill to eliminate letterboxing.
 * For extreme landscape images (>2:1 ratio), crops to fill instead.
 *
 * Performance: Uses CSS gradient instead of duplicate image for background effect.
 * This saves ~1-2MB bandwidth per image load compared to the blur approach.
 */
export function ImmersiveImage({ src, alt, children, priority = false }: ImmersiveImageProps) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setAspectRatio(img.naturalWidth / img.naturalHeight);
    }
  }, []);

  // Extreme landscape (>2:1) gets cropped to fill
  const useObjectCover = aspectRatio !== null && aspectRatio > 2.0;
  // Portrait images are already mobile-optimized, no fill needed
  const needsBackgroundFill = aspectRatio !== null && aspectRatio >= 0.9 && !useObjectCover;

  return (
    <>
      {/* Gradient background layer - replaces duplicate blurred image (saves bandwidth) */}
      {needsBackgroundFill && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60"
        />
      )}

      {/* Main image - smart object-fit based on aspect ratio */}
      <img
        src={src}
        alt={alt}
        onLoad={handleLoad}
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? "eager" : "lazy"}
        className={`absolute inset-0 w-full h-full z-10 ${
          useObjectCover ? "object-cover" : "object-contain"
        }`}
      />

      {/* Overlay children (e.g., expand icon) */}
      {children}
    </>
  );
}
