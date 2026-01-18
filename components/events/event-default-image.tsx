"use client";

interface EventDefaultImageProps {
  title: string;
  className?: string;
  priority?: boolean;
}

/**
 * Responsive default event image component
 * Serves mobile or desktop version based on screen size
 */
export function EventDefaultImage({
  title,
  className = "",
  priority = false
}: EventDefaultImageProps) {
  return (
    <picture className={className}>
      {/* Mobile version for screens < 768px */}
      <source
        media="(max-width: 767px)"
        srcSet="/images/defaults/event-default-mobile.png"
      />
      {/* Desktop version for screens >= 768px */}
      <source
        media="(min-width: 768px)"
        srcSet="/images/defaults/event-default-desktop.png"
      />
      {/* Fallback image */}
      <img
        src="/images/defaults/event-default-desktop.png"
        alt={`${title} - DaLat.app default event image`}
        className={className}
        loading={priority ? "eager" : "lazy"}
      />
    </picture>
  );
}

/**
 * Get the appropriate default image URL for SSR or direct usage
 */
export function getDefaultEventImageUrl(isMobile: boolean = false): string {
  return isMobile 
    ? "/images/defaults/event-default-mobile.png"
    : "/images/defaults/event-default-desktop.png";
}
