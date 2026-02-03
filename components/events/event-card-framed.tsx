"use client";

import { memo } from "react";
import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, Sparkles } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { SeriesBadge } from "@/components/events/series-badge";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl, isDefaultImageUrl } from "@/lib/media-utils";
import { cloudflareLoader } from "@/lib/image-cdn";
import { cn, decodeUnicodeEscapes } from "@/lib/utils";
import type { Event, EventCounts, Locale } from "@/lib/types";

// Tiny gradient placeholder for perceived instant loading
const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZTVlNWU1Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZjVmNWY1Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+";

interface EventCardFramedProps {
  event: Event;
  counts?: EventCounts;
  seriesRrule?: string;
  translatedTitle?: string;
  priority?: boolean;
}

/**
 * Framed event card with matte-style padding around the image.
 *
 * Key differences from EventCard:
 * - No flip animation - tapping navigates directly to event
 * - Title is below the image, not overlaid (better readability, no truncation issues)
 * - Matte frame around image gives a gallery-like polish to any flyer
 */
export const EventCardFramed = memo(function EventCardFramed({
  event,
  counts,
  seriesRrule,
  translatedTitle,
  priority,
}: EventCardFramedProps) {
  const t = useTranslations("events");
  const locale = useLocale() as Locale;

  const hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url);
  const imageIsVideo = isVideoUrl(event.image_url);
  const displayTitle = translatedTitle || event.title;
  const isSponsored = (event.sponsor_tier ?? 0) > 0;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block touch-manipulation"
      prefetch={false}
    >
      <Card className={cn(
        "overflow-hidden rounded-xl transition-all duration-200 active:scale-[0.98] active:opacity-90",
        isSponsored
          ? "border-2 border-amber-400/80 shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:shadow-[0_0_30px_rgba(251,191,36,0.4)] hover:border-amber-400"
          : "border-border/50 hover:border-foreground/20 hover:shadow-lg"
      )}>
        {/* Image container - edge to edge, no frame */}
        <div className="relative aspect-[4/5] overflow-hidden group">
            {/* Sponsored badge - takes priority over Popular */}
            {isSponsored ? (
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-yellow-400 text-white text-xs font-medium rounded-full flex items-center gap-1 shadow-lg">
                <Sparkles className="w-3 h-3" />
                {t("sponsored")}
              </div>
            ) : (counts?.going_spots ?? 0) >= 20 && (
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-amber-500/90 text-white text-xs font-medium rounded-full">
                {t("popular")}
              </div>
            )}

            {/* Series badge */}
            {seriesRrule && (
              <div className="absolute top-2 left-2 z-10">
                <SeriesBadge rrule={seriesRrule} variant="overlay" />
              </div>
            )}

            {/* Image */}
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

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" aria-hidden="true" />
        </div>

        {/* Info panel - title always visible, not overlaid */}
        <CardContent className="p-3 sm:p-4">
          <h3 className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 min-h-[2.5rem] mb-2">
            {displayTitle}
          </h3>

          <div className="flex flex-col gap-1 text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span>
                {formatInDaLat(event.starts_at, "EEE, MMM d", locale)} · {formatInDaLat(event.starts_at, "h:mm a", locale)}
              </span>
            </div>

            {event.location_name && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">{decodeUnicodeEscapes(event.location_name)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});
