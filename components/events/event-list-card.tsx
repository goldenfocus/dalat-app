"use client";

import { memo } from "react";
import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, Users } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { SeriesBadge } from "@/components/events/series-badge";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { cloudflareLoader } from "@/lib/image-cdn";
import { usePrefetch } from "@/lib/prefetch";
import { decodeUnicodeEscapes } from "@/lib/utils";
import { getCardCoverUrl, getPastProof, shouldShowGoingCount, type EventSocial } from "@/lib/events/social-proof";
import type { Event, EventCounts, Locale } from "@/lib/types";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZTVlNWU1Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZjVmNWY1Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+";

interface EventListCardProps {
  event: Event;
  counts?: EventCounts;
  social?: EventSocial;
  seriesRrule?: string;
  translatedTitle?: string;
  /** When true, only shows time (date is shown in section header) */
  hideDate?: boolean;
}

function isEventPast(startsAt: string, endsAt: string | null): boolean {
  const now = new Date();
  if (endsAt) {
    return new Date(endsAt) < now;
  }
  const startDate = new Date(startsAt);
  const defaultEnd = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
  return defaultEnd < now;
}

/**
 * Horizontal list card for compact event display.
 * Shows thumbnail on left, details stacked on right.
 */
export const EventListCard = memo(function EventListCard({
  event,
  counts,
  social,
  seriesRrule,
  translatedTitle,
  hideDate,
}: EventListCardProps) {
  const t = useTranslations("events");
  const locale = useLocale() as Locale;
  const { prefetchEvent, prefetchEventCounts } = usePrefetch();

  const handlePrefetch = () => {
    prefetchEvent(event.slug);
    prefetchEventCounts(event.id);
  };

  const goingSpots = counts?.going_spots ?? 0;
  const spotsText = event.capacity
    ? `${goingSpots}/${event.capacity}`
    : `${goingSpots}`;

  const isPast = isEventPast(event.starts_at, event.ends_at);
  const coverUrl = getCardCoverUrl(event.image_url, social);
  const hasCustomImage = !!coverUrl;
  const imageIsVideo = isVideoUrl(coverUrl);
  const displayTitle = translatedTitle || event.title;
  const pastProof = getPastProof(social);

  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex gap-3 p-3 rounded-lg border border-border/50 bg-card hover:border-foreground/20 hover:bg-accent/50 transition-all active:scale-[0.99] active:opacity-90 touch-manipulation"
      onClick={() => triggerHaptic("selection")}
      onMouseEnter={handlePrefetch}
      onTouchStart={handlePrefetch}
    >
      {/* Thumbnail */}
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-md overflow-hidden">
        {hasCustomImage ? (
          imageIsVideo ? (
            <video
              src={coverUrl!}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
          ) : (
            <Image
              loader={cloudflareLoader}
              src={coverUrl!}
              alt={displayTitle}
              fill
              sizes="96px"
              className="object-cover"
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
        {seriesRrule && (
          <div className="absolute top-1 left-1">
            <SeriesBadge rrule={seriesRrule} variant="overlay" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <h3 className="font-semibold text-base line-clamp-1">
          {displayTitle}
        </h3>

        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">
            {hideDate
              ? formatInDaLat(event.starts_at, "h:mm a", locale)
              : `${formatInDaLat(event.starts_at, "EEE, MMM d", locale)} · ${formatInDaLat(event.starts_at, "h:mm a", locale)}`}
          </span>
        </div>

        {event.location_name && (
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{decodeUnicodeEscapes(event.location_name)}</span>
          </div>
        )}

        {/* Going count only when meaningful; past-proof beats a near-zero count */}
        {shouldShowGoingCount(goingSpots) ? (
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
            <Users className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>
              {spotsText} {isPast ? t("went") : t("going")}
            </span>
          </div>
        ) : pastProof && !isPast ? (
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
            <Users className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">
              {pastProof.kind === "both" && t("pastProofBoth", { went: pastProof.went, photos: pastProof.photos })}
              {pastProof.kind === "photos" && t("pastProofPhotos", { photos: pastProof.photos })}
              {pastProof.kind === "went" && t("pastProofWent", { went: pastProof.went })}
            </span>
          </div>
        ) : event.capacity && !isPast ? (
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
            <Users className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span>{t("spotsAvailable", { count: event.capacity - goingSpots })}</span>
          </div>
        ) : null}
      </div>
    </Link>
  );
});
