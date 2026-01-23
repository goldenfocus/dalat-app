"use client";

import { useEffect } from "react";
import { optimizedImageUrl, imagePresets } from "@/lib/image-cdn";

interface MomentImagePreloaderProps {
  prevMediaUrl: string | null;
  nextMediaUrl: string | null;
}

/**
 * Preloads adjacent moment images in the background for instant navigation.
 * Uses the browser's image cache so when the user navigates, images are ready.
 */
export function MomentImagePreloader({ prevMediaUrl, nextMediaUrl }: MomentImagePreloaderProps) {
  useEffect(() => {
    const preloadImage = (url: string | null) => {
      if (!url) return;

      // Get optimized URL (same as what the detail page will request)
      const optimizedUrl = optimizedImageUrl(url, { width: 672, quality: 70 }) || url;

      // Create an image element to trigger browser caching
      const img = new window.Image();
      img.src = optimizedUrl;
    };

    // Preload both adjacent images
    preloadImage(prevMediaUrl);
    preloadImage(nextMediaUrl);
  }, [prevMediaUrl, nextMediaUrl]);

  // This component renders nothing - it just preloads images
  return null;
}
