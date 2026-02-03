"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { MomentLightbox, type LightboxMoment } from "./moment-lightbox";

interface MomentsLightboxContextValue {
  openLightbox: (index: number) => void;
  closeLightbox: () => void;
  isOpen: boolean;
  currentIndex: number;
}

const MomentsLightboxContext = createContext<MomentsLightboxContextValue | null>(null);

interface MomentsLightboxProviderProps {
  children: ReactNode;
  moments: LightboxMoment[];
  eventSlug?: string;
}

export function MomentsLightboxProvider({
  children,
  moments,
  eventSlug,
}: MomentsLightboxProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const openLightbox = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleIndexChange = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  return (
    <MomentsLightboxContext.Provider
      value={{ openLightbox, closeLightbox, isOpen, currentIndex }}
    >
      {children}
      <MomentLightbox
        moments={moments}
        initialIndex={currentIndex}
        isOpen={isOpen}
        onClose={closeLightbox}
        eventSlug={eventSlug}
        onIndexChange={handleIndexChange}
      />
    </MomentsLightboxContext.Provider>
  );
}

export function useMomentsLightbox() {
  const context = useContext(MomentsLightboxContext);
  if (!context) {
    throw new Error("useMomentsLightbox must be used within a MomentsLightboxProvider");
  }
  return context;
}

/**
 * Hook to get the lightbox opener for a specific moment by ID.
 * Returns null if outside provider (graceful fallback to link navigation).
 */
export function useMomentLightboxOpener(momentId: string, moments: LightboxMoment[]) {
  const context = useContext(MomentsLightboxContext);

  if (!context) {
    return null; // Graceful fallback - MomentCard will use Link navigation
  }

  const index = moments.findIndex(m => m.id === momentId);
  if (index === -1) {
    return null;
  }

  return () => context.openLightbox(index);
}
