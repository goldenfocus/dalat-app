"use client";

import { memo } from "react";
import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { MapPin, Users, Clock, Radio } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl, isDefaultImageUrl } from "@/lib/media-utils";
import { cloudflareLoader } from "@/lib/image-cdn";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { Event, EventCounts, Locale } from "@/lib/types";

interface EventHeroCardProps {
  event: Event;
  counts?: EventCounts;
  translatedTitle?: string;
}

/**
 * Legendary hero card for "Happening Now" events.
 * Full-width, attention-grabbing design with pulsing LIVE indicator.
 */
export const EventHeroCard = memo(function EventHeroCard({
  event,
  counts,
  translatedTitle,
}: EventHeroCardProps) {
  const t = useTranslations("events");
  const tHome = useTranslations("home");
  const locale = useLocale() as Locale;

  const hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url);
  const imageIsVideo = isVideoUrl(event.image_url);
  const displayTitle = translatedTitle || event.title;

  // Calculate time info
  const startTime = new Date(event.starts_at);
  const now = new Date();
  const minutesAgo = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));

  // Time display: "Started X min ago" or "Ends at X:XX PM"
  const timeDisplay = minutesAgo < 60
    ? tHome("happeningNow.startedAgo", { minutes: minutesAgo })
    : event.ends_at
      ? tHome("happeningNow.endsAt", { time: formatInDaLat(event.ends_at, "h:mm a", locale) })
      : formatInDaLat(event.starts_at, "h:mm a", locale);

  const spotsText = event.capacity
    ? `${counts?.going_spots ?? 0}/${event.capacity}`
    : `${counts?.going_spots ?? 0}`;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group block relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-rose-500/10 via-purple-500/10 to-indigo-500/10"
    >
      {/* Animated glow border */}
      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500 opacity-75 blur-sm group-hover:opacity-100 transition-opacity animate-pulse" />

      {/* Card content container */}
      <div className="relative bg-background rounded-2xl overflow-hidden">
        {/* Main layout: side-by-side on larger screens, stacked on mobile */}
        <div className="flex flex-col sm:flex-row">
          {/* Image section */}
          <div className="relative w-full sm:w-2/5 aspect-[16/9] sm:aspect-auto sm:min-h-[200px]">
            {hasCustomImage ? (
              imageIsVideo ? (
                <video
                  src={event.image_url!}
                  className={`absolute inset-0 w-full h-full ${event.image_fit === "cover" ? "object-cover" : "object-contain bg-black"}`}
                  style={event.image_fit === "cover" && event.focal_point ? { objectPosition: event.focal_point } : undefined}
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
                  sizes="(max-width: 640px) 100vw, 40vw"
                  className={`group-hover:scale-105 transition-transform duration-500 ${event.image_fit === "cover" ? "object-cover" : "object-contain bg-muted"}`}
                  style={event.image_fit === "cover" && event.focal_point ? { objectPosition: event.focal_point } : undefined}
                  priority
                />
              )
            ) : (
              <EventDefaultImage
                title={displayTitle}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

            {/* Gradient overlay for mobile (text over image) */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent sm:hidden" />
          </div>

          {/* Content section */}
          <div className="relative flex-1 p-5 sm:p-6 flex flex-col justify-center">
            {/* LIVE badge - top right */}
            <div className="absolute top-4 right-4 sm:top-5 sm:right-5">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-sm font-semibold rounded-full shadow-lg shadow-red-500/30">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>{tHome("happeningNow.live")}</span>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl sm:text-2xl font-bold leading-tight line-clamp-2 pr-20 sm:pr-24 mb-3">
              {displayTitle}
            </h3>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {/* Time indicator */}
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span className="text-foreground font-medium">{timeDisplay}</span>
              </div>

              {/* Location */}
              {event.location_name && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  <span className="line-clamp-1">{decodeUnicodeEscapes(event.location_name)}</span>
                </div>
              )}

              {/* Attendees */}
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                <span>{spotsText} {t("going")}</span>
              </div>
            </div>

            {/* CTA hint */}
            <div className="mt-4 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              {tHome("happeningNow.tapToJoin")} →
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
});
