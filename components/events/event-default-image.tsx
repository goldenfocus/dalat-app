interface EventDefaultImageProps {
  title: string;
  className?: string;
  priority?: boolean;
}

const DEFAULT_IMAGE_URL = "/images/defaults/event-default-desktop.png";

/**
 * Default event image component - uses a single clean image for all screen sizes.
 * CSS object-cover handles cropping for different aspect ratios.
 */
export function EventDefaultImage({
  title,
  className = "",
  priority = false
}: EventDefaultImageProps) {
  return (
    <img
      src={DEFAULT_IMAGE_URL}
      alt={`${title} - ĐàLạt.app default event image`}
      className={`w-full h-full object-cover ${className}`}
      loading={priority ? "eager" : "lazy"}
    />
  );
}

/**
 * Get the default image URL for SSR or direct usage
 */
export function getDefaultEventImageUrl(): string {
  return DEFAULT_IMAGE_URL;
}
