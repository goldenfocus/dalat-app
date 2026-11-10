import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { ArrowUpRight, Clock, Users } from "lucide-react";
import { LazyVideoCover } from "@/components/events/lazy-video-cover";
import { FogCanvas } from "@/components/home/fog-canvas";
import { eventImageAlt } from "@/lib/events/image-alt";
import { HERO_IMAGE_SIZES, heroImageSources } from "@/lib/events/hero-image";
import { formatInDaLat } from "@/lib/timezone";
import { hasLamVienTbdSchedule } from "@/lib/activity-graph/lam-vien-tbd";
import { isVideoUrl } from "@/lib/media-utils";
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
  /** Set only while the event is underway; shows the LIVE chip. */
  live?: string;
  /** Call to action on the card, e.g. "Tap to join" */
  cta: string;
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
 * Server-rendered homepage featured card: one full-bleed photo, one action.
 * No card-level hydration; only the fog canvas (and a video cover, when the
 * event has one) are client islands.
 * Image sources come from heroImageSources so the page's LCP preload matches.
 */
export function EventHeroCardServer({
  event,
  counts,
  social,
  translatedTitle,
  labels,
}: EventHeroCardServerProps) {
  const coverUrl = getCardCoverUrl(event.image_url, social);
  const isFallbackCover = !!coverUrl && coverUrl !== event.image_url;
  const imageIsVideo = isVideoUrl(coverUrl);
  const displayTitle = translatedTitle || event.title;
  const goingSpots = counts?.going_spots ?? 0;
  const sources = coverUrl && !imageIsVideo ? heroImageSources(coverUrl) : null;
  const fillsFrame = event.image_fit === "cover";
  const focalStyle =
    fillsFrame && event.focal_point
      ? { objectPosition: event.focal_point }
      : undefined;
  const spotsText = event.capacity
    ? `${goingSpots}/${event.capacity}`
    : `${goingSpots}`;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="fog-scoop-lg fog-shadow group relative isolate block aspect-[4/5] max-h-[36rem] w-full overflow-hidden bg-[hsl(169_35%_6%)] text-white sm:aspect-[16/9] lg:aspect-[2/1]"
    >
      {coverUrl && imageIsVideo ? (
        <LazyVideoCover
          src={coverUrl}
          eager
          preload="metadata"
          className={`absolute inset-0 h-full w-full ${fillsFrame ? "object-cover" : "object-contain"}`}
          style={focalStyle}
        />
      ) : sources ? (
        <>
          {!fillsFrame && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sources.src}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl"
              aria-hidden="true"
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...sources}
            alt={isFallbackCover ? displayTitle : eventImageAlt(event, displayTitle)}
            className={`absolute inset-0 h-full w-full ${fillsFrame ? "fog-drift object-cover" : "object-contain"}`}
            style={focalStyle}
            fetchPriority="high"
            loading="eager"
            decoding="async"
          />
        </>
      ) : event.source_platform !== "activity-graph" ? (
        <Image
          src={DEFAULT_IMAGE_URL}
          alt={displayTitle}
          fill
          sizes={HERO_IMAGE_SIZES}
          className="object-cover"
          priority
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
        />
      ) : null}

      <FogCanvas />
      <span className="fog-scrim" aria-hidden="true" />
      <span className="fog-frame-line" aria-hidden="true" />

      <div className="absolute inset-x-5 top-5 z-[5] flex flex-wrap gap-1.5 sm:inset-x-7 sm:top-7">
        {labels.live && (
          <span className="fog-chip fog-chip-live">
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
              aria-hidden="true"
            />
            {labels.live}
          </span>
        )}
        <span className="fog-chip fog-chip-glass">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {labels.timeDisplay}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-[5] grid gap-2.5 p-6 sm:p-9">
        {event.location_name && (
          <p className="fog-cap line-clamp-1 opacity-85">
            {decodeUnicodeEscapes(event.location_name)}
          </p>
        )}
        {/* h2: the featured plan is the first section under the page h1 */}
        <h2 className="max-w-3xl text-[clamp(1.9rem,7.4vw,3.2rem)] font-bold leading-[1.02] line-clamp-3 [text-shadow:0_2px_24px_rgb(6_16_14/0.6)]">
          {displayTitle}
        </h2>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          {shouldShowGoingCount(goingSpots) ? (
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
              <Users className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">
                {spotsText} {labels.going}
              </span>
            </span>
          ) : (
            <span />
          )}
          <span className="fog-cta fog-scoop">
            {labels.cta}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </span>
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
  },
): string {
  if (hasLamVienTbdSchedule(event.source_metadata)) return "TBD";
  const startTime = new Date(event.starts_at);
  const now = new Date();
  const minutesAgo = Math.floor(
    (now.getTime() - startTime.getTime()) / (1000 * 60),
  );

  if (minutesAgo < 60) {
    return tHome.startedAgo(Math.max(0, minutesAgo));
  }
  if (event.ends_at) {
    return tHome.endsAt(formatInDaLat(event.ends_at, "h:mm a", locale));
  }
  return formatInDaLat(event.starts_at, "h:mm a", locale);
}
