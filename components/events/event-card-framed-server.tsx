import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SeriesBadge } from "@/components/events/series-badge";
import { LazyVideoCover } from "@/components/events/lazy-video-cover";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl } from "@/lib/media-utils";
import { optimizedImageUrl } from "@/lib/image-cdn";
import { cn, decodeUnicodeEscapes } from "@/lib/utils";
import {
  getCardCoverUrl,
  getPastProof,
  shouldShowGoingCount,
  type EventSocial,
} from "@/lib/events/social-proof";
import type { CardEvent, EventCounts, Locale } from "@/lib/types";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZTVlNWU1Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZjVmNWY1Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+";

const DEFAULT_IMAGE_URL = "/images/defaults/event-default-desktop.png";

export interface EventCardFramedLabels {
  popular: string;
  spotsAvailable: string;
  photoBy: string;
  pastProofBoth: string;
  pastProofPhotos: string;
  pastProofWent: string;
}

interface EventCardFramedServerProps {
  event: CardEvent;
  counts?: EventCounts;
  social?: EventSocial;
  seriesRrule?: string;
  translatedTitle?: string;
  priority?: boolean;
  locale: Locale;
  labels: EventCardFramedLabels;
}

/**
 * Server-rendered framed event card — zero hydration for the card shell.
 * Only video covers pull in a tiny LazyVideoCover client island.
 *
 * Uses resolved CDN URLs (not next/image loader fn) so props stay serializable
 * when nested under the client Link from next-intl.
 */
export function EventCardFramedServer({
  event,
  counts,
  social,
  seriesRrule,
  translatedTitle,
  priority,
  locale,
  labels,
}: EventCardFramedServerProps) {
  const coverUrl = getCardCoverUrl(event.image_url, social);
  const hasCustomImage = !!coverUrl;
  const isFallbackCover = hasCustomImage && coverUrl !== event.image_url;
  const imageIsVideo = isVideoUrl(coverUrl);
  const displayTitle = translatedTitle || event.title;
  const isSponsored = (event.sponsor_tier ?? 0) > 0;
  const goingSpots = counts?.going_spots ?? 0;
  const pastProof = getPastProof(social);

  // Resolve CDN URL on the server — no function props across client boundaries
  const resolvedCover =
    coverUrl && !imageIsVideo
      ? optimizedImageUrl(coverUrl, { width: 640, quality: 70 }) || coverUrl
      : null;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block touch-manipulation"
      prefetch={false}
    >
      <Card
        className={cn(
          "overflow-hidden rounded-xl transition-all duration-200 active:scale-[0.98] active:opacity-90",
          isSponsored
            ? "border-2 border-amber-400/80 shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:shadow-[0_0_30px_rgba(251,191,36,0.4)] hover:border-amber-400"
            : "border-border/50 hover:border-foreground/20 hover:shadow-lg"
        )}
      >
        <div className="relative aspect-[4/5] overflow-hidden group">
          {event.capacity ? (
            shouldShowGoingCount(goingSpots) ? (
              <div
                className={cn(
                  "absolute top-2 right-2 z-10 px-2 py-0.5 text-white text-xs font-medium rounded-full flex items-center gap-1",
                  goingSpots >= event.capacity
                    ? "bg-orange-500/90"
                    : "bg-black/60 backdrop-blur-sm"
                )}
              >
                <Users className="w-3 h-3" />
                {goingSpots}/{event.capacity}
              </div>
            ) : (
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-full flex items-center gap-1">
                <Users className="w-3 h-3" />
                {labels.spotsAvailable}
              </div>
            )
          ) : (
            !isSponsored &&
            goingSpots >= 20 && (
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 bg-amber-500/90 text-white text-xs font-medium rounded-full">
                {labels.popular}
              </div>
            )
          )}

          {seriesRrule && (
            <div className="absolute top-2 left-2 z-10">
              <SeriesBadge rrule={seriesRrule} variant="overlay" />
            </div>
          )}

          {hasCustomImage ? (
            imageIsVideo ? (
              <LazyVideoCover
                src={coverUrl!}
                className={`w-full h-full ${event.image_fit === "cover" ? "object-cover" : "object-contain bg-black"}`}
                style={
                  event.image_fit === "cover" && event.focal_point
                    ? { objectPosition: event.focal_point }
                    : undefined
                }
              />
            ) : (
              <>
                {event.image_fit !== "cover" && resolvedCover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolvedCover}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60"
                    aria-hidden="true"
                  />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolvedCover!}
                  alt={displayTitle}
                  className={`absolute inset-0 w-full h-full transition-transform group-hover:scale-105 ${event.image_fit === "cover" ? "object-cover" : "object-contain"}`}
                  style={
                    event.image_fit === "cover" && event.focal_point
                      ? { objectPosition: event.focal_point }
                      : undefined
                  }
                  // LCP: first card only
                  fetchPriority={priority ? "high" : "auto"}
                  loading={priority ? "eager" : "lazy"}
                  decoding="async"
                />
              </>
            )
          ) : (
            <Image
              src={DEFAULT_IMAGE_URL}
              alt={displayTitle}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover w-full h-full"
              priority={priority}
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
            />
          )}

          {isFallbackCover && social?.fallback_photo_credit && (
            <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 bg-black/50 backdrop-blur-sm text-white text-xs rounded-full">
              {labels.photoBy}
            </div>
          )}

          <div
            className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"
            aria-hidden="true"
          />
        </div>

        <CardContent className="p-3 sm:p-4">
          <h3 className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 min-h-[2.5rem] mb-2">
            {displayTitle}
          </h3>

          <div className="flex flex-col gap-1 text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span>
                {formatInDaLat(event.starts_at, "EEE, MMM d", locale)} ·{" "}
                {formatInDaLat(event.starts_at, "h:mm a", locale)}
              </span>
            </div>

            {event.location_name && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">
                  {decodeUnicodeEscapes(event.location_name)}
                </span>
              </div>
            )}

            {!shouldShowGoingCount(goingSpots) && pastProof && (
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">
                  {pastProof.kind === "both" && labels.pastProofBoth}
                  {pastProof.kind === "photos" && labels.pastProofPhotos}
                  {pastProof.kind === "went" && labels.pastProofWent}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
