"use client";

import { memo } from "react";
import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { useLocale } from "next-intl";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl, isDefaultImageUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { cloudflareLoader } from "@/lib/image-cdn";
import { usePrefetch } from "@/lib/prefetch";
import type { Event, Locale } from "@/lib/types";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZTVlNWU1Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZjVmNWY1Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+";

interface EventCardCompactProps {
  event: Event;
  translatedTitle?: string;
  priority?: boolean;
}

/**
 * Compact event card with landscape aspect ratio and text overlay.
 * Designed for mobile-first density - shows 4+ events on first screen.
 * Only displays title + date, no location or RSVP counts.
 */
export const EventCardCompact = memo(function EventCardCompact({
  event,
  translatedTitle,
  priority,
}: EventCardCompactProps) {
  const locale = useLocale() as Locale;
  const { prefetchEvent, prefetchEventCounts } = usePrefetch();

  const handlePrefetch = () => {
    prefetchEvent(event.slug);
    prefetchEventCounts(event.id);
  };

  const hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url);
  const imageIsVideo = isVideoUrl(event.image_url);
  const displayTitle = translatedTitle || event.title;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block relative w-full aspect-[3/2] rounded-lg overflow-hidden touch-manipulation group"
      onClick={() => triggerHaptic("selection")}
      onMouseEnter={handlePrefetch}
      onTouchStart={handlePrefetch}
    >
      {/* Full-bleed image */}
      <div className="absolute inset-0">
        {hasCustomImage ? (
          imageIsVideo ? (
            <video
              src={event.image_url!}
              className={`w-full h-full ${event.image_fit === "contain" ? "object-contain bg-black" : "object-cover"}`}
              style={event.image_fit === "cover" && event.focal_point ? { objectPosition: event.focal_point } : undefined}
              muted
              loop
              playsInline
              autoPlay
              preload="metadata"
              aria-hidden="true"
            />
          ) : (
            <Image
              loader={cloudflareLoader}
              src={event.image_url!}
              alt={displayTitle}
              fill
              sizes="(max-width: 640px) 50vw, 33vw"
              className={`transition-transform group-hover:scale-105 ${event.image_fit === "contain" ? "object-contain" : "object-cover"}`}
              style={event.image_fit === "cover" && event.focal_point ? { objectPosition: event.focal_point } : undefined}
              priority={priority}
              fetchPriority={priority ? "high" : "auto"}
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
            />
          )
        ) : (
          <EventDefaultImage
            title={displayTitle}
            className="object-cover w-full h-full"
          />
        )}
      </div>

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" aria-hidden="true" />

      {/* Text content - bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
        <h3 className="font-semibold text-sm leading-tight line-clamp-1 drop-shadow-lg">
          {displayTitle}
        </h3>
        <p className="text-xs text-white/80 mt-0.5 drop-shadow">
          {formatInDaLat(event.starts_at, "EEE, MMM d", locale)} · {formatInDaLat(event.starts_at, "h:mm a", locale)}
        </p>
      </div>

      {/* Hover/active state overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 group-active:bg-black/20 transition-colors" aria-hidden="true" />
    </Link>
  );
});
