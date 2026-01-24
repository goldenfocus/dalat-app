import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { SeriesBadge } from "@/components/events/series-badge";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl, isDefaultImageUrl } from "@/lib/media-utils";
import { optimizedImageUrl } from "@/lib/image-cdn";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { Event, EventCounts, Locale } from "@/lib/types";

interface EventCardStaticProps {
  event: Event;
  counts?: EventCounts;
  seriesRrule?: string;
  translatedTitle?: string;
  locale: Locale;
  labels: {
    going: string;
    went: string;
    full: string;
    interested: string;
    waitlist: string;
  };
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

/**
 * Server-rendered EventCard for LCP optimization.
 *
 * Unlike the client EventCard, this component:
 * - Renders without "use client" directive
 * - Does not require hydration before the image loads
 * - Receives translations as props (no useTranslations hook)
 *
 * Use this for the first card (LCP element) to eliminate hydration delay.
 */
export function EventCardStatic({
  event,
  counts,
  seriesRrule,
  translatedTitle,
  locale,
  labels,
}: EventCardStaticProps) {
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
    >
      <Card className="overflow-hidden hover:border-foreground/20 hover:shadow-lg transition-all duration-200 active:scale-[0.98] active:opacity-90">
        {/* Image area */}
        <div className="w-full aspect-[4/5] relative overflow-hidden group">
          {hasCustomImage ? (
            imageIsVideo ? (
              <video
                src={event.image_url!}
                className={`w-full h-full ${event.image_fit === "contain" ? "object-contain" : "object-cover"}`}
                style={event.image_fit === "cover" && event.focal_point ? { objectPosition: event.focal_point } : undefined}
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={optimizedImageUrl(event.image_url!, { width: 400, quality: 70 }) || event.image_url!}
                alt={displayTitle}
                className={`absolute inset-0 w-full h-full transition-transform group-hover:scale-105 ${event.image_fit === "contain" ? "object-contain" : "object-cover"}`}
                style={event.image_fit === "cover" && event.focal_point ? { objectPosition: event.focal_point } : undefined}
                fetchPriority="high"
                decoding="async"
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
                {spotsText} {isPast ? labels.went : labels.going}
                {isFull && (
                  <span className="ml-1 text-orange-500">({labels.full})</span>
                )}
                {(counts?.interested_count ?? 0) > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    &middot; {counts?.interested_count} {labels.interested}
                  </span>
                )}
                {(counts?.waitlist_count ?? 0) > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    &middot; {counts?.waitlist_count} {labels.waitlist}
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
