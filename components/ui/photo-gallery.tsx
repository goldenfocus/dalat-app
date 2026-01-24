"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { VenuePhoto } from "@/lib/types";

interface PhotoGalleryProps {
  photos: VenuePhoto[];
  className?: string;
}

export function PhotoGallery({ photos, className }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const isOpen = lightboxIndex !== null;

  // Sort photos by sort_order
  const sortedPhotos = [...photos].sort((a, b) => a.sort_order - b.sort_order);

  const handlePrevious = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex(lightboxIndex === 0 ? sortedPhotos.length - 1 : lightboxIndex - 1);
  }, [lightboxIndex, sortedPhotos.length]);

  const handleNext = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex(lightboxIndex === sortedPhotos.length - 1 ? 0 : lightboxIndex + 1);
  }, [lightboxIndex, sortedPhotos.length]);

  const handleClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowLeft") handlePrevious();
      if (e.key === "ArrowRight") handleNext();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleClose, handlePrevious, handleNext]);

  // Don't render if no photos
  if (sortedPhotos.length === 0) return null;

  const currentPhoto = lightboxIndex !== null ? sortedPhotos[lightboxIndex] : null;

  return (
    <>
      {/* Photo Grid */}
      <div className={className}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sortedPhotos.map((photo, index) => (
            <button
              key={photo.url}
              onClick={() => setLightboxIndex(index)}
              className="relative aspect-square rounded-lg overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 active:scale-[0.98] transition-transform"
            >
              <img
                src={photo.url}
                alt={photo.caption || ""}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {isOpen && currentPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          onClick={handleClose}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Navigation buttons */}
          {sortedPhotos.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevious();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95"
                aria-label="Next photo"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </>
          )}

          {/* Image container */}
          <div
            className="relative z-10 max-w-[95vw] max-h-[85vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentPhoto.url}
              alt={currentPhoto.caption || ""}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            {/* Caption */}
            {currentPhoto.caption && (
              <p className="mt-4 text-white/80 text-center max-w-lg px-4">
                {currentPhoto.caption}
              </p>
            )}
          </div>

          {/* Photo counter */}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-white/50 text-sm">
            {lightboxIndex + 1} / {sortedPhotos.length}
          </p>
        </div>
      )}
    </>
  );
}
