"use client";

import { memo } from "react";
import Image from "next/image";
import { useRouter } from "@/lib/i18n/routing";
import { Calendar, MapPin, Users, Clock } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { SeriesBadge } from "@/components/events/series-badge";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl, isDefaultImageUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { cloudflareLoader } from "@/lib/image-cdn";
import { usePrefetch } from "@/lib/prefetch";
import { cn, decodeUnicodeEscapes } from "@/lib/utils";
import type { Event, EventCounts, Locale } from "@/lib/types";

// Tiny gradient placeholder for perceived instant loading
const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZTVlNWU1Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZjVmNWY1Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+";

interface EventCardProps {
  event: Event;
  counts?: EventCounts;
  seriesRrule?: string;
  seriesSlug?: string;
  translatedTitle?: string;
  priority?: boolean;
  isFlipped?: boolean;
  onFlip?: (eventId: string) => void;
}

// Check if event is past (same logic as rsvp-button)
function isEventPast(startsAt: string, endsAt: string | null): boolean {
  const now = new Date();
  if (endsAt) {
    return new Date(endsAt) < now;
  }
  const startDate = new Date(startsAt);
  const defaultEnd = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
  return defaultEnd < now;
}

export const EventCard = memo(function EventCard({
  event,
  counts,
  seriesRrule,
  translatedTitle,
  priority,
  isFlipped = false,
  onFlip,
}: EventCardProps) {
  const t = useTranslations("events");
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

  const spotsText = event.capacity
    ? `${counts?.going_spots ?? 0}/${event.capacity}`
    : `${counts?.going_spots ?? 0}`;

  const isFull = event.capacity
    ? (counts?.going_spots ?? 0) >= event.capacity
    : false;

  const isPast = isEventPast(event.starts_at, event.ends_at);

  const hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url);
  const imageIsVideo = isVideoUrl(event.image_url);
  const displayTitle = translatedTitle || event.title;
  const isSponsored = (event.sponsor_tier ?? 0) > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      className="relative w-full cursor-pointer touch-manipulation [perspective:1000px]"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handlePrefetch}
      onTouchStart={handlePrefetch}
      aria-label={`${displayTitle}. Tap to ${isFlipped ? "open event" : "see details"}`}
    >
      {/* Flip container */}
      <div
        className={`relative w-full transition-transform duration-300 [transform-style:preserve-3d] ${
          isFlipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* Front face - Image + Title overlay */}
        <div
          className={cn(
            "relative w-full rounded-xl overflow-hidden [backface-visibility:hidden] group",
            isFlipped ? "invisible" : "",
            isSponsored && "ring-2 ring-amber-400/80 shadow-[0_0_20px_rgba(251,191,36,0.3)]"
          )}
          aria-hidden={isFlipped}
        >
          {/* Image area with 4:5 aspect ratio */}
          <div className="w-full aspect-[4/5] relative overflow-hidden">
            {/* Capacity badge - shows spots when event has a cap */}
            {event.capacity ? (
              <div className={cn(
                "absolute top-2 right-2 z-10 px-2 py-0.5 text-white text-xs font-medium rounded-full flex items-center gap-1",
                isFull ? "bg-orange-500/90" : "bg-black/60 backdrop-blur-sm"
              )}>
                <Users className="w-3 h-3" />
                {counts?.going_spots ?? 0}/{event.capacity}
              </div>
            ) : (
              /* Popular badge (only for non-sponsored events with 20+ attendees, no cap) */
              !isSponsored && (counts?.going_spots ?? 0) >= 20 && (
                <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-amber-500/90 text-white text-xs font-medium rounded-full">
                  {t("popular")}
                </div>
              )
            )}
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
                <>
                  {/* Blurred background for contain mode - creates soft color extension */}
                  {event.image_fit !== "cover" && (
                    <Image
                      loader={cloudflareLoader}
                      src={event.image_url!}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover blur-xl scale-110 opacity-60"
                      aria-hidden="true"
                    />
                  )}
                  {/* Main image */}
                  <Image
                    loader={cloudflareLoader}
                    src={event.image_url!}
                    alt={displayTitle}
                    fill
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 33vw, 25vw"
                    className={`transition-transform group-hover:scale-105 ${event.image_fit === "cover" ? "object-cover" : "object-contain"}`}
                    style={event.image_fit === "cover" && event.focal_point ? { objectPosition: event.focal_point } : undefined}
                    priority={priority}
                    fetchPriority={priority ? "high" : "auto"}
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                  />
                </>
              )
            ) : (
              <EventDefaultImage
                title={displayTitle}
                className="object-cover w-full h-full"
              />
            )}
            {/* Series badge */}
            {seriesRrule && (
              <div className="absolute top-2 left-2">
                <SeriesBadge rrule={seriesRrule} variant="overlay" />
              </div>
            )}

            {/* Gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden="true" />

            {/* Title overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
              <h3 className="font-semibold text-lg leading-tight line-clamp-2 drop-shadow-lg">
                {displayTitle}
              </h3>
            </div>

            {/* Hover/active state overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 group-active:bg-black/20 transition-colors" aria-hidden="true" />
          </div>
        </div>

        {/* Back face - Details */}
        <div
          className={`absolute inset-0 rounded-xl overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] bg-zinc-900 ${
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
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover blur-sm"
                aria-hidden="true"
              />
            )}
          </div>

          {/* Content - same aspect ratio as front */}
          <div className="relative w-full aspect-[4/5] flex flex-col justify-center p-5 text-white">
            <h3 className="font-semibold text-lg leading-tight line-clamp-2 mb-4">
              {displayTitle}
            </h3>

            <div className="flex flex-col gap-2.5 text-sm text-white/90">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 flex-shrink-0 text-white/70" />
                <span>{formatInDaLat(event.starts_at, "EEE, MMM d", locale)}</span>
              </div>

              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 flex-shrink-0 text-white/70" />
                <span>{formatInDaLat(event.starts_at, "h:mm a", locale)}</span>
              </div>

              {event.location_name && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 flex-shrink-0 text-white/70" />
                  <span className="line-clamp-1">{decodeUnicodeEscapes(event.location_name)}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 flex-shrink-0 text-white/70" />
                <span>
                  {spotsText} {isPast ? t("went") : t("going")}
                  {isFull && (
                    <span className="ml-1 text-orange-400">({t("full")})</span>
                  )}
                </span>
              </div>

              {(counts?.interested_count ?? 0) > 0 && (
                <div className="text-white/60 text-xs pl-6">
                  {counts?.interested_count} {t("interested")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
