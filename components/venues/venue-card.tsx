"use client";

import { Link } from "@/lib/i18n/routing";
import { BadgeCheck, Calendar, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import { VenueHoursBadge } from "./venue-hours-badge";
import type { VenueListItem } from "@/lib/types";

interface VenueCardProps {
  venue: VenueListItem;
  className?: string;
}

export function VenueCard({ venue, className }: VenueCardProps) {
  const typeConfig = getVenueTypeConfig(venue.venue_type);
  const TypeIcon = typeConfig.icon;

  return (
    <Link href={`/venues/${venue.slug}`}>
      <Card
        className={cn(
          "overflow-hidden hover:border-primary/50 transition-all active:scale-[0.98]",
          className
        )}
      >
        {/* Cover image or type-colored header */}
        {venue.cover_photo_url ? (
          <div className="relative aspect-[2/1]">
            <img
              src={venue.cover_photo_url}
              alt=""
              className="w-full h-full object-cover"
            />
            {/* Happening now indicator */}
            {venue.has_happening_now && (
              <div className="absolute top-2 right-2">
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-500 text-white rounded-full animate-pulse">
                  <span className="w-1.5 h-1.5 bg-white rounded-full" />
                  Live
                </span>
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "aspect-[3/1] flex items-center justify-center",
              typeConfig.bgColor,
              typeConfig.darkBgColor
            )}
          >
            <TypeIcon
              className={cn("w-10 h-10", typeConfig.color, typeConfig.darkColor)}
            />
          </div>
        )}

        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Logo */}
            {venue.logo_url ? (
              <img
                src={venue.logo_url}
                alt=""
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div
                className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
                  typeConfig.bgColor,
                  typeConfig.darkBgColor
                )}
              >
                <TypeIcon
                  className={cn("w-6 h-6", typeConfig.color, typeConfig.darkColor)}
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Name and verified badge */}
              <h3 className="font-semibold truncate flex items-center gap-1.5">
                {venue.name}
                {venue.is_verified && (
                  <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </h3>

              {/* Type badge */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded mt-1",
                  typeConfig.bgColor,
                  typeConfig.darkBgColor,
                  typeConfig.color,
                  typeConfig.darkColor
                )}
              >
                <TypeIcon className="w-3 h-3" />
                {typeConfig.label}
              </span>

              {/* Address */}
              {venue.address && (
                <p className="text-xs text-muted-foreground mt-1 truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {venue.address}
                </p>
              )}
            </div>
          </div>

          {/* Footer: Open status and event count */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <VenueHoursBadge operatingHours={venue.operating_hours} />

            {venue.upcoming_event_count > 0 ? (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Calendar className="w-3.5 h-3.5" />
                {venue.upcoming_event_count} upcoming
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No events</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
