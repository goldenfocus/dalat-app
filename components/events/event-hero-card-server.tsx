import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { MapPin, Users, Clock, Radio } from "lucide-react";
import { LazyVideoCover } from "@/components/events/lazy-video-cover";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl } from "@/lib/media-utils";
import { optimizedImageUrl } from "@/lib/image-cdn";
import { decodeUnicodeEscapes } from "@/lib/utils";
import {
  getCardCoverUrl,
  shouldShowGoingCount,
  type EventSocial,
} from "@/lib/events/social-proof";
import type { CardEvent, EventCounts, Locale } from "@/lib/types";

const BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjZTVlNWU1Ii8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjZjVmNWY1Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIi8+PC9zdmc+";

const DEFAULT_IMAGE_URL = "/images/defaults/event-default-desktop.png";

export interface EventHeroCardLabels {
  live: string;
  tapToJoin: string;
  going: string;
  /** Pre-resolved time line, e.g. "Started 12 min ago" */
  timeDisplay: string;
}

interface EventHeroCardServerProps {
  event: CardEvent;
  counts?: EventCounts;
  social?: EventSocial;
  translatedTitle?: string;
  labels: EventHeroCardLabels;
}

/**
 * Server-rendered "Happening Now" hero — no card-level hydration.
 * Resolves CDN URLs on the server (no next/image loader fn across Link).
 */
export function EventHeroCardServer({
  event,
  counts,
  social,
  translatedTitle,
  labels,
}: EventHeroCardServerProps) {
  const coverUrl = getCardCoverUrl(event.image_url, social);
  const hasCustomImage = !!coverUrl;
  const imageIsVideo = isVideoUrl(coverUrl);
  const displayTitle = translatedTitle || event.title;
  const goingSpots = counts?.going_spots ?? 0;

  const resolvedCover =
    coverUrl && !imageIsVideo
      ? optimizedImageUrl(coverUrl, { width: 1080, quality: 70 }) || coverUrl
      : null;

  const spotsText = event.capacity
    ? `${counts?.going_spots ?? 0}/${event.capacity}`
    : `${counts?.going_spots ?? 0}`;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group block relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-rose-500/10 via-purple-500/10 to-indigo-500/10"
    >
      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500 opacity-75 blur-sm group-hover:opacity-100 transition-opacity animate-pulse" />

      <div className="relative bg-background rounded-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          <div className="relative w-full sm:w-2/5 aspect-[16/9] sm:aspect-auto sm:min-h-[200px]">
            {hasCustomImage ? (
              imageIsVideo ? (
                <LazyVideoCover
                  src={coverUrl!}
                  eager
                  preload="metadata"
                  className={`absolute inset-0 w-full h-full ${event.image_fit === "cover" ? "object-cover" : "object-contain bg-black"}`}
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
                    className={`absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-500 ${event.image_fit === "cover" ? "object-cover" : "object-contain"}`}
                    style={
                      event.image_fit === "cover" && event.focal_point
                        ? { objectPosition: event.focal_point }
                        : undefined
                    }
                    fetchPriority="high"
                    loading="eager"
                    decoding="async"
                  />
                </>
              )
            ) : (
              <Image
                src={DEFAULT_IMAGE_URL}
                alt={displayTitle}
                fill
                sizes="(max-width: 640px) 100vw, 40vw"
                className="object-cover"
                priority
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
              />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent sm:hidden" />
          </div>

          <div className="relative flex-1 p-5 sm:p-6 flex flex-col justify-center">
            <div className="absolute top-4 right-4 sm:top-5 sm:right-5">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-sm font-semibold rounded-full shadow-lg shadow-red-500/30">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>{labels.live}</span>
              </div>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold leading-tight line-clamp-2 pr-20 sm:pr-24 mb-3">
              {displayTitle}
            </h3>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span className="text-foreground font-medium">
                  {labels.timeDisplay}
                </span>
              </div>

              {event.location_name && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  <span className="line-clamp-1">
                    {decodeUnicodeEscapes(event.location_name)}
                  </span>
                </div>
              )}

              {shouldShowGoingCount(goingSpots) && (
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>
                    {spotsText} {labels.going}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              {labels.tapToJoin} →
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Resolve hero time display string on the server. */
export function resolveHeroTimeDisplay(
  event: CardEvent,
  locale: Locale,
  tHome: {
    startedAgo: (minutes: number) => string;
    endsAt: (time: string) => string;
  }
): string {
  const startTime = new Date(event.starts_at);
  const now = new Date();
  const minutesAgo = Math.floor(
    (now.getTime() - startTime.getTime()) / (1000 * 60)
  );

  if (minutesAgo < 60) {
    return tHome.startedAgo(Math.max(0, minutesAgo));
  }
  if (event.ends_at) {
    return tHome.endsAt(formatInDaLat(event.ends_at, "h:mm a", locale));
  }
  return formatInDaLat(event.starts_at, "h:mm a", locale);
}
