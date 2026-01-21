import Image from "next/image";

interface EventDefaultImageProps {
  title: string;
  className?: string;
  priority?: boolean;
}

const DEFAULT_IMAGE_URL = "/images/defaults/event-default-desktop.png";

/**
 * Default event image component - uses Next.js Image for automatic WebP/AVIF optimization.
 * This reduces the 722KB PNG to ~50-100KB with modern formats.
 */
export function EventDefaultImage({
  title,
  className = "",
  priority = false
}: EventDefaultImageProps) {
  return (
    <Image
      src={DEFAULT_IMAGE_URL}
      alt={`${title} - ĐàLạt.app default event image`}
      fill
      sizes="(max-width: 768px) 100vw, 50vw"
      priority={priority}
      fetchPriority={priority ? "high" : "auto"}
      className={`object-cover ${className}`}
    />
  );
}

/**
 * Get the default image URL for SSR or direct usage
 */
export function getDefaultEventImageUrl(): string {
  return DEFAULT_IMAGE_URL;
}
