"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { cloudflareLoader } from "@/lib/image-cdn";

// Tiny gradient placeholder for perceived instant loading (only ~150 bytes)
const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMjIyIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMTExIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+";

interface ImmersiveImageProps {
  src: string;
  alt: string;
  children?: React.ReactNode;
  priority?: boolean;
  imageFit?: "cover" | "contain";
  focalPoint?: string | null;
}

/**
 * Renders an image with a gradient background fill to eliminate letterboxing.
 * For extreme landscape images (>2:1 ratio), crops to fill instead.
 *
 * Performance: Uses Next.js Image for automatic WebP/AVIF optimization.
 * Also uses CSS gradient instead of duplicate image for background effect.
 *
 * LCP optimization: For priority images, defer aspect ratio detection to avoid
 * blocking the initial render with a state update.
 */
export function ImmersiveImage({ src, alt, children, priority = false, imageFit, focalPoint }: ImmersiveImageProps) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);

  // For priority images, defer aspect ratio calculation to avoid blocking LCP
  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (priority) {
      // Store reference for deferred calculation
      setImageElement(e.currentTarget);
    } else {
      // Non-priority images: calculate immediately
      const img = e.currentTarget;
      if (img.naturalWidth && img.naturalHeight) {
        setAspectRatio(img.naturalWidth / img.naturalHeight);
      }
    }
  }, [priority]);

  // Deferred aspect ratio calculation for priority images
  useEffect(() => {
    if (priority && imageElement) {
      // Use requestIdleCallback to defer calculation until browser is idle
      const calculateAspectRatio = () => {
        if (imageElement.naturalWidth && imageElement.naturalHeight) {
          setAspectRatio(imageElement.naturalWidth / imageElement.naturalHeight);
        }
      };

      if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(calculateAspectRatio, { timeout: 500 });
        return () => window.cancelIdleCallback(id);
      } else {
        // Fallback: use setTimeout with a small delay
        const id = setTimeout(calculateAspectRatio, 100);
        return () => clearTimeout(id);
      }
    }
  }, [priority, imageElement]);

  // If imageFit is explicitly set, use that; otherwise use smart detection
  const useObjectCover = imageFit
    ? imageFit === "cover"
    : aspectRatio !== null && aspectRatio > 2.0;
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
      <Image
        loader={cloudflareLoader}
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        priority={priority}
        fetchPriority={priority ? "high" : "auto"}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        onLoad={handleLoad}
        className={`z-10 ${useObjectCover ? "object-cover" : "object-contain"}`}
        style={useObjectCover && focalPoint ? { objectPosition: focalPoint } : undefined}
      />

      {/* Overlay children (e.g., expand icon) */}
      {children}
    </>
  );
}
