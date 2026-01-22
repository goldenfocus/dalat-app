"use client";

import { useState } from "react";
import Image from "next/image";
import { Expand } from "lucide-react";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { isVideoUrl } from "@/lib/media-utils";
import { cloudflareLoader } from "@/lib/image-cdn";

interface EventMediaDisplayProps {
  src: string;
  alt: string;
  /** Set to true for LCP images (hero images above the fold) */
  priority?: boolean;
}

export function EventMediaDisplay({
  src,
  alt,
  priority = false,
}: EventMediaDisplayProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isVideo = isVideoUrl(src);

  if (isVideo) {
    return (
      <div className="aspect-video rounded-lg overflow-hidden">
        <video
          src={src}
          className="object-cover w-full h-full"
          controls
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
        />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="w-full rounded-lg overflow-hidden relative group cursor-pointer aspect-[3/4] max-h-[60vh] md:aspect-video md:max-h-none"
        aria-label="View full flyer"
      >
        <Image
          loader={cloudflareLoader}
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 960px"
          className="object-contain md:object-cover transition-transform group-hover:scale-[1.02]"
          priority={priority}
          fetchPriority={priority ? "high" : "auto"}
        />
        {/* Expand overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-3">
            <Expand className="w-6 h-6 text-white" />
          </div>
        </div>
      </button>

      <ImageLightbox
        src={src}
        alt={alt}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
