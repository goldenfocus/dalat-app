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

interface EventImmersiveCardProps {
  event: Event;
  counts?: EventCounts;
  social?: EventSocial;
  seriesRrule?: string;
  translatedTitle?: string;
  priority?: boolean;
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
 * Full-screen immersive card for TikTok-style browsing.
 * Large image with text overlaid at bottom.
 */
export const EventImmersiveCard = memo(function EventImmersiveCard({
  event,
  counts,
  social,
  seriesRrule,
  translatedTitle,
  priority,
}: EventImmersiveCardProps) {
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

  const isFull = event.capacity ? goingSpots >= event.capacity : false;

  const isPast = isEventPast(event.starts_at, event.ends_at);
  const coverUrl = getCardCoverUrl(event.image_url, social);
  const hasCustomImage = !!coverUrl;
  const isFallbackCover = hasCustomImage && coverUrl !== event.image_url;
  const imageIsVideo = isVideoUrl(coverUrl);
  const displayTitle = translatedTitle || event.title;
  const pastProof = getPastProof(social);

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block relative w-full aspect-[9/16] sm:aspect-[3/4] rounded-xl overflow-hidden touch-manipulation group"
      onClick={() => triggerHaptic("selection")}
      onMouseEnter={handlePrefetch}
      onTouchStart={handlePrefetch}
    >
      {/* Full-bleed image */}
      <div className="absolute inset-0">
        {hasCustomImage ? (
          imageIsVideo ? (
            <video
              src={coverUrl!}
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
              {/* Blurred background for contain mode */}
              {event.image_fit !== "cover" && (
                <Image
                  loader={cloudflareLoader}
                  src={coverUrl!}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover blur-xl scale-110 opacity-60"
                  aria-hidden="true"
                />
              )}
              <Image
                loader={cloudflareLoader}
                src={coverUrl!}
                alt={displayTitle}
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
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
      </div>

      {/* Series badge - top left */}
      {seriesRrule && (
        <div className="absolute top-3 left-3 z-10">
          <SeriesBadge rrule={seriesRrule} variant="overlay" />
        </div>
      )}

      {/* Popular badge - top right */}
      {goingSpots >= 20 && (
        <div className="absolute top-3 right-3 z-10 px-2.5 py-1 bg-amber-500/90 text-white text-xs font-medium rounded-full">
          {t("popular")}
        </div>
      )}

      {/* Photographer credit for fallback covers */}
      {isFallbackCover && social?.fallback_photo_credit && (
        <div className="absolute top-3 right-3 z-10 px-2.5 py-1 bg-black/50 backdrop-blur-sm text-white text-xs rounded-full"
          style={goingSpots >= 20 ? { top: "3.25rem" } : undefined}
        >
          {t("photoBy", { name: social.fallback_photo_credit })}
        </div>
      )}

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" aria-hidden="true" />

      {/* Text content - bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 text-white">
        <h3 className="font-bold text-xl sm:text-2xl mb-3 line-clamp-2 drop-shadow-lg">
          {displayTitle}
        </h3>

        <div className="flex flex-col gap-2 text-sm sm:text-base text-white/90">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            <span>
              {formatInDaLat(event.starts_at, "EEEE, MMMM d", locale)} &middot;{" "}
              {formatInDaLat(event.starts_at, "h:mm a", locale)}
            </span>
          </div>

          {event.location_name && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              <span className="line-clamp-1">{decodeUnicodeEscapes(event.location_name)}</span>
            </div>
          )}

          {/* Going count only when meaningful; past-proof beats a near-zero count */}
          {shouldShowGoingCount(goingSpots) ? (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              <span>
                {spotsText} {isPast ? t("went") : t("going")}
                {isFull && (
                  <span className="ml-1 text-orange-300">({t("full")})</span>
                )}
                {(counts?.interested_count ?? 0) > 0 && (
                  <span className="ml-1 opacity-80">
                    &middot; {counts?.interested_count} {t("interested")}
                  </span>
                )}
              </span>
            </div>
          ) : pastProof && !isPast ? (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              <span className="line-clamp-1">
                {pastProof.kind === "both" && t("pastProofBoth", { went: pastProof.went, photos: pastProof.photos })}
                {pastProof.kind === "photos" && t("pastProofPhotos", { photos: pastProof.photos })}
                {pastProof.kind === "went" && t("pastProofWent", { went: pastProof.went })}
              </span>
            </div>
          ) : event.capacity && !isPast ? (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              <span>{t("spotsAvailable", { count: event.capacity - goingSpots })}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Hover/active state overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 group-active:bg-black/20 transition-colors" aria-hidden="true" />
    </Link>
  );
});
