"use client";

import { useState } from "react";
import Image from "next/image";
import { Expand } from "lucide-react";
import { ImageLightbox } from "@/components/ui/image-lightbox";

interface BlogCoverImageProps {
  src: string;
  alt: string;
}

export function BlogCoverImage({ src, alt }: BlogCoverImageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="relative aspect-[2/1] w-full rounded-xl overflow-hidden mb-8 bg-muted group cursor-pointer"
        aria-label="View full image"
      >
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover transition-transform group-hover:scale-[1.02]"
          priority
          sizes="(max-width: 768px) 100vw, 768px"
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
