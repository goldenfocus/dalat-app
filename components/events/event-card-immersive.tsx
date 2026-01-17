"use client";

import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { ImmersiveImage } from "@/components/events/immersive-image";
import { SeriesBadge } from "@/components/events/series-badge";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl, isDefaultImageUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import type { Event, EventCounts, Locale } from "@/lib/types";

interface EventCardImmersiveProps {
  event: Event;
  counts?: EventCounts;
  seriesRrule?: string;
  seriesSlug?: string;
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

export function EventCardImmersive({ event, counts, seriesRrule, priority = false }: EventCardImmersiveProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("events");

  const spotsText = event.capacity
    ? `${counts?.going_spots ?? 0}/${event.capacity}`
    : `${counts?.going_spots ?? 0}`;

  const isFull = event.capacity
    ? (counts?.going_spots ?? 0) >= event.capacity
    : false;

  const isPast = isEventPast(event.starts_at, event.ends_at);

  // Treat default image URLs as "no image" to use responsive EventDefaultImage
  const hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url);
  const imageIsVideo = isVideoUrl(event.image_url);

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block h-[100dvh] w-full relative snap-start bg-black touch-manipulation active:opacity-95 transition-opacity duration-150"
      onClick={() => triggerHaptic("selection")}
    >
      <article className="h-full w-full relative flex flex-col">
        {/* Media area - fills most of viewport */}
        <div className="flex-1 relative overflow-hidden">
          {hasCustomImage ? (
            imageIsVideo ? (
              <video
                src={event.image_url!}
                className="absolute inset-0 w-full h-full object-contain"
                muted
                loop
                playsInline
                autoPlay
              />
            ) : (
              <ImmersiveImage src={event.image_url!} alt={event.title} priority={priority} />
            )
          ) : (
            <EventDefaultImage
              title={event.title}
              className="absolute inset-0 w-full h-full object-contain"
              priority
            />
          )}
          {/* Series badge - positioned with safe area for notch */}
          {seriesRrule && (
            <div className="absolute top-[env(safe-area-inset-top,12px)] left-4 z-10 pt-3">
              <SeriesBadge rrule={seriesRrule} variant="overlay" />
            </div>
          )}
        </div>

        {/* Info area with gradient overlay */}
        <div className="absolute bottom-0 inset-x-0 z-20">
          <div className="bg-gradient-to-t from-black via-black/80 to-transparent pt-20 pb-8 px-5">
            <h2 className="text-white font-semibold text-2xl mb-3 line-clamp-2 drop-shadow-lg">
              {event.title}
            </h2>

            <div className="flex flex-col gap-2 text-white/90">
              <div className="flex items-center gap-2.5 drop-shadow-md">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">
                  {formatInDaLat(event.starts_at, "EEE, MMM d", locale)} &middot;{" "}
                  {formatInDaLat(event.starts_at, "h:mm a", locale)}
                </span>
              </div>

              {event.location_name && (
                <div className="flex items-center gap-2.5 drop-shadow-md">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm line-clamp-1">{event.location_name}</span>
                </div>
              )}

              <div className="flex items-center gap-2.5 drop-shadow-md">
                <Users className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">
                  {spotsText} {isPast ? t("went") : t("going")}
                  {isFull && (
                    <span className="ml-1 text-orange-400">({t("full")})</span>
                  )}
                  {(counts?.interested_count ?? 0) > 0 && (
                    <span className="ml-1 text-white/70">
                      &middot; {counts?.interested_count} {t("interested")}
                    </span>
                  )}
                  {(counts?.waitlist_count ?? 0) > 0 && (
                    <span className="ml-1 text-white/70">
                      &middot; {counts?.waitlist_count} {t("waitlist")}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
