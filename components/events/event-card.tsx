"use client";

import Link from "next/link";
import { Calendar, MapPin, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl, isDefaultImageUrl } from "@/lib/media-utils";
import type { Event, EventCounts } from "@/lib/types";

interface EventCardProps {
  event: Event;
  counts?: EventCounts;
}

export function EventCard({ event, counts }: EventCardProps) {
  const spotsText = event.capacity
    ? `${counts?.going_spots ?? 0}/${event.capacity}`
    : `${counts?.going_spots ?? 0}`;

  const isFull = event.capacity
    ? (counts?.going_spots ?? 0) >= event.capacity
    : false;

  const hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url);
  const imageIsVideo = isVideoUrl(event.image_url);

  return (
    <Link href={`/events/${event.slug}`} prefetch={false} className="block">
      <Card className="overflow-hidden hover:border-foreground/20 transition-colors">
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
              />
            ) : (
              <img
                src={event.image_url!}
                alt={event.title}
                className="object-cover w-full h-full transition-transform group-hover:scale-105"
              />
            )
          ) : (
            <EventDefaultImage
              title={event.title}
              className="object-cover w-full h-full"
            />
          )}
        </div>

        {/* Text area */}
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg mb-2 line-clamp-1">
            {event.title}
          </h3>

          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>
                {formatInDaLat(event.starts_at, "EEE, MMM d")} &middot;{" "}
                {formatInDaLat(event.starts_at, "h:mm a")}
              </span>
            </div>

            {event.location_name && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span className="line-clamp-1">{event.location_name}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>
                {spotsText} going
                {isFull && (
                  <span className="ml-1 text-orange-500">(Full)</span>
                )}
                {(counts?.interested_count ?? 0) > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    &middot; {counts?.interested_count} interested
                  </span>
                )}
                {(counts?.waitlist_count ?? 0) > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    &middot; {counts?.waitlist_count} waitlist
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
