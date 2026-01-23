"use client";

import { useState } from "react";
import Image from "next/image";
import { cloudflareLoader, optimizedImageUrl, imagePresets } from "@/lib/image-cdn";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { Expand } from "lucide-react";

interface ExpandableMomentImageProps {
  src: string;
  alt: string;
}

export function ExpandableMomentImage({ src, alt }: ExpandableMomentImageProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Get full-resolution URL for the lightbox
  const fullSizeUrl = optimizedImageUrl(src, imagePresets.momentFullscreen) || src;

  return (
    <>
      <button
        onClick={() => setIsLightboxOpen(true)}
        className="group absolute inset-0 w-full h-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label="Expand image"
      >
        <Image
          loader={cloudflareLoader}
          src={src}
          alt={alt}
          fill
          className="object-contain"
          sizes="(max-width: 672px) 100vw, 672px"
          priority
        />
        {/* Expand hint on hover */}
        <div className="absolute bottom-3 right-3 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Expand className="w-4 h-4" />
        </div>
      </button>

      <ImageLightbox
        src={fullSizeUrl}
        alt={alt}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
      />
    </>
  );
}
