"use client";

import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, Users } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { SeriesBadge } from "@/components/events/series-badge";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl, isDefaultImageUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { cloudflareLoader } from "@/lib/image-cdn";
import { usePrefetch } from "@/lib/prefetch";
import { decodeUnicodeEscapes } from "@/lib/utils";
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

export function EventCard({ event, counts, seriesRrule, translatedTitle, priority }: EventCardProps) {
  const t = useTranslations("events");
  const locale = useLocale() as Locale;
  const { prefetchEvent, prefetchEventCounts } = usePrefetch();

  const handlePrefetch = () => {
    prefetchEvent(event.slug);
    prefetchEventCounts(event.id);
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

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block touch-manipulation"
      onClick={() => triggerHaptic("selection")}
      onMouseEnter={handlePrefetch}
      onTouchStart={handlePrefetch}
    >
      <Card className="overflow-hidden hover:border-foreground/20 transition-all duration-150 active:scale-[0.98] active:opacity-90">
        {/* Image area */}
        <div className="w-full aspect-[4/5] relative overflow-hidden group">
          {hasCustomImage ? (
            imageIsVideo ? (
              <video
                src={event.image_url!}
                className="object-cover w-full h-full"
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
              />
            ) : (
              <Image
                loader={cloudflareLoader}
                src={event.image_url!}
                alt={displayTitle}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover transition-transform group-hover:scale-105"
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
          {/* Series badge */}
          {seriesRrule && (
            <div className="absolute top-2 left-2">
              <SeriesBadge rrule={seriesRrule} variant="overlay" />
            </div>
          )}
        </div>

        {/* Text area */}
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg mb-2 line-clamp-1">
            {displayTitle}
          </h3>

          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>
                {formatInDaLat(event.starts_at, "EEE, MMM d", locale)} &middot;{" "}
                {formatInDaLat(event.starts_at, "h:mm a", locale)}
              </span>
            </div>

            {event.location_name && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span className="line-clamp-1">{decodeUnicodeEscapes(event.location_name)}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>
                {spotsText} {isPast ? t("went") : t("going")}
                {isFull && (
                  <span className="ml-1 text-orange-500">({t("full")})</span>
                )}
                {(counts?.interested_count ?? 0) > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    &middot; {counts?.interested_count} {t("interested")}
                  </span>
                )}
                {(counts?.waitlist_count ?? 0) > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    &middot; {counts?.waitlist_count} {t("waitlist")}
                  </span>
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
