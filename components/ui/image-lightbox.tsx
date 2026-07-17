"use client";

import { useEffect, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, isOpen, onClose }: ImageLightboxProps) {
  const t = useTranslations("common");
  const [isLandscape, setIsLandscape] = useState(false);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      // Consider landscape if wider than tall (aspect ratio > 1)
      setIsLandscape(img.naturalWidth > img.naturalHeight);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleEscape]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setIsLandscape(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 overflow-hidden"
      onClick={onClose}
    >
      {/* Blurred background for landscape images - creates immersive effect */}
      {isLandscape && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-3xl opacity-40"
        />
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-20 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        aria-label={t("close")}
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Image container */}
      <div
        className="relative z-10 max-w-[95vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          onLoad={handleImageLoad}
          className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        />
      </div>

      {/* Tap anywhere hint */}
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-white/50 text-sm">
        Tap anywhere to close
      </p>
    </div>
  );
}
