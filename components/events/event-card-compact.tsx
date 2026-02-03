"use client";

import { memo } from "react";
import Image from "next/image";
import { useRouter } from "@/lib/i18n/routing";
import { useLocale } from "next-intl";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl, isDefaultImageUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { cloudflareLoader } from "@/lib/image-cdn";
import { usePrefetch } from "@/lib/prefetch";
import { MapPin, Calendar, Clock } from "lucide-react";
import type { Event, Locale } from "@/lib/types";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZTVlNWU1Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZjVmNWY1Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+";

interface EventCardCompactProps {
  event: Event;
  translatedTitle?: string;
  priority?: boolean;
  isFlipped?: boolean;
  onFlip?: (eventId: string) => void;
}

/**
 * Compact event card with flip interaction.
 * Front: image + title only (clean, visual-first)
 * Back: date, time, location (revealed on tap)
 * Tap to flip, tap again to navigate.
 */
export const EventCardCompact = memo(function EventCardCompact({
  event,
  translatedTitle,
  priority,
  isFlipped = false,
  onFlip,
}: EventCardCompactProps) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { prefetchEvent, prefetchEventCounts } = usePrefetch();

  const handlePrefetch = () => {
    prefetchEvent(event.slug);
    prefetchEventCounts(event.id);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    triggerHaptic("selection");

    if (isFlipped) {
      // Already flipped - navigate to event
      router.push(`/events/${event.slug}`);
    } else {
      // Not flipped - flip it
      onFlip?.(event.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(e as unknown as React.MouseEvent);
    }
  };

  const hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url);
  const imageIsVideo = isVideoUrl(event.image_url);
  const displayTitle = translatedTitle || event.title;

  return (
    <div
      role="button"
      tabIndex={0}
      className="relative w-full aspect-[3/2] rounded-lg cursor-pointer touch-manipulation [perspective:1000px]"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handlePrefetch}
      onTouchStart={handlePrefetch}
      aria-label={`${displayTitle}. Tap to ${isFlipped ? "open event" : "see details"}`}
    >
      {/* Flip container */}
      <div
        className={`relative w-full h-full transition-transform duration-300 [transform-style:preserve-3d] ${
          isFlipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* Front face - Image + Title */}
        <div
          className={`absolute inset-0 rounded-lg overflow-hidden [backface-visibility:hidden] group ${
            isFlipped ? "invisible" : ""
          }`}
          aria-hidden={isFlipped}
        >
          {/* Full-bleed image */}
          <div className="absolute inset-0">
            {hasCustomImage ? (
              imageIsVideo ? (
                <video
                  src={event.image_url!}
                  className={`w-full h-full ${event.image_fit === "cover" ? "object-cover" : "object-contain bg-black"}`}
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
                  className={`transition-transform group-hover:scale-105 ${event.image_fit === "cover" ? "object-cover" : "object-contain bg-muted"}`}
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

          {/* Title only - cleaner front face */}
          <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
            <h3 className="font-semibold text-sm leading-tight line-clamp-1 drop-shadow-lg">
              {displayTitle}
            </h3>
          </div>

          {/* Hover/active state overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 group-active:bg-black/20 transition-colors" aria-hidden="true" />
        </div>

        {/* Back face - Details */}
        <div
          className={`absolute inset-0 rounded-lg overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] bg-zinc-900 ${
            !isFlipped ? "invisible" : ""
          }`}
          aria-hidden={!isFlipped}
        >
          {/* Blurred image background */}
          <div className="absolute inset-0 opacity-30">
            {hasCustomImage && !imageIsVideo && (
              <Image
                loader={cloudflareLoader}
                src={event.image_url!}
                alt=""
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className="object-cover blur-sm"
                aria-hidden="true"
              />
            )}
          </div>

          {/* Content */}
          <div className="relative h-full flex flex-col justify-center p-3 text-white">
            <h3 className="font-semibold text-sm leading-tight line-clamp-2 mb-2">
              {displayTitle}
            </h3>

            <div className="space-y-1 text-xs text-white/80">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 flex-shrink-0" />
                <span>{formatInDaLat(event.starts_at, "MMM d", locale)}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span>{formatInDaLat(event.starts_at, "h:mm a", locale)}</span>
              </div>

              {event.location_name && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="line-clamp-1">{event.location_name}</span>
                </div>
              )}
            </div>

{/* Hint removed - card is small and tapping again is intuitive */}
          </div>
        </div>
      </div>
    </div>
  );
});
