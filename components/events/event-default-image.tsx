"use client";

import { useState } from "react";
import Image from "next/image";
import { Expand } from "lucide-react";
import { ImageLightbox } from "@/components/ui/image-lightbox";

interface EventDefaultImageProps {
  title: string;
  className?: string;
  priority?: boolean;
}

const DEFAULT_IMAGE_URL = "/images/defaults/event-default-desktop.png";

// Light gradient blur placeholder matching the default image colors
const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZmZlNGU2Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZmNlN2Y2Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+";

/**
 * Default event image component - uses Next.js Image for automatic WebP/AVIF optimization.
 * This reduces the 722KB PNG to ~50-100KB with modern formats.
 *
 * Uses the same aspect ratio constraints as EventMediaDisplay:
 * - Mobile: 3:4 aspect with max 60vh height
 * - Desktop: 16:9 aspect ratio
 *
 * Clickable to open lightbox, matching EventMediaDisplay behavior.
 */
export function EventDefaultImage({
  title,
  className = "",
  priority = false
}: EventDefaultImageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className={`w-full rounded-lg overflow-hidden relative group cursor-pointer aspect-[3/4] max-h-[60vh] md:aspect-video md:max-h-none mx-auto ${className}`}
        aria-label="View full image"
      >
        <Image
          src={DEFAULT_IMAGE_URL}
          alt={`${title} - ĐàLạt.app default event image`}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          priority={priority}
          fetchPriority={priority ? "high" : "auto"}
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          className="object-cover transition-transform group-hover:scale-[1.02]"
        />
        {/* Expand overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-3">
            <Expand className="w-6 h-6 text-white" />
          </div>
        </div>
      </button>

      <ImageLightbox
        src={DEFAULT_IMAGE_URL}
        alt={`${title} - ĐàLạt.app default event image`}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}

/**
 * Get the default image URL for SSR or direct usage
 */
export function getDefaultEventImageUrl(): string {
  return DEFAULT_IMAGE_URL;
}
