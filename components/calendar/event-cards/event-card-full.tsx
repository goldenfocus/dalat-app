"use client";

import { Link } from "@/lib/i18n/routing";
import type { Event } from "@/lib/types";
import { formatInDaLat } from "@/lib/timezone";
import { cn, decodeUnicodeEscapes } from "@/lib/utils";
import { MapPin, Clock } from "lucide-react";

interface EventCardFullProps {
  event: Event;
  isPast?: boolean;
}

export function EventCardFull({ event, isPast }: EventCardFullProps) {
  const startTime = formatInDaLat(event.starts_at, "h:mm a");
  const endTime = event.ends_at ? formatInDaLat(event.ends_at, "h:mm a") : null;

  return (
    <Link
      href={`/events/${event.slug}`}
      className={cn(
        "block p-4 rounded-xl border bg-card hover:bg-muted/50 transition-all",
        "active:scale-[0.99]",
        isPast && "opacity-60"
      )}
    >
      <div className="flex gap-4">
        {/* Event image */}
        {event.image_url ? (
          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
            <img
              src={event.image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-lg flex-shrink-0 bg-muted flex items-center justify-center">
            <Clock className="w-6 h-6 text-muted-foreground" />
          </div>
        )}

        {/* Event details */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h4 className="font-semibold text-base line-clamp-2 mb-2">
            {event.title}
          </h4>

          {/* Time */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {startTime}
              {endTime && ` - ${endTime}`}
            </span>
          </div>

          {/* Location */}
          {event.location_name && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              <span className="truncate">{decodeUnicodeEscapes(event.location_name)}</span>
            </div>
          )}

          {/* Past event badge */}
          {isPast && (
            <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Past event
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
