"use client";

import { Link } from "@/lib/i18n/routing";
import { BadgeCheck, Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import { triggerHaptic } from "@/lib/haptics";
import type { VenueListItem } from "@/lib/types";

interface VenueCardProps {
  venue: VenueListItem;
  className?: string;
}

export function VenueCard({ venue, className }: VenueCardProps) {
  const t = useTranslations("venues");
  const typeConfig = getVenueTypeConfig(venue.venue_type);
  const TypeIcon = typeConfig.icon;

  return (
    <Link href={`/venues/${venue.slug}`} onClick={() => triggerHaptic("selection")}>
      <Card
        className={cn(
          "overflow-hidden hover:border-primary/50 transition-all active:scale-[0.98]",
          className
        )}
      >
        {/* Cover image with subtle overlay for text readability */}
        {venue.cover_photo_url ? (
          <div className="relative aspect-[2/1]">
            <img
              src={venue.cover_photo_url}
              alt=""
              className="w-full h-full object-cover"
            />
            {/* Subtle gradient for logo visibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

            {/* Logo overlay on cover - bottom left */}
            {venue.logo_url && (
              <div className="absolute bottom-3 left-3">
                <img
                  src={venue.logo_url}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover ring-2 ring-white/20 shadow-lg"
                />
              </div>
            )}

            {/* Event indicator - subtle dot in corner if has events */}
            {(venue.has_happening_now || venue.upcoming_event_count > 0) && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                {venue.has_happening_now ? (
                  <span className="w-2 h-2 bg-white rounded-full shadow-lg animate-pulse" />
                ) : venue.upcoming_event_count > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-white/90 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
                    <Calendar className="w-3 h-3" />
                    {venue.upcoming_event_count}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          /* No cover - clean minimal placeholder */
          <div className="aspect-[3/1] bg-muted/50 flex items-center justify-center">
            <TypeIcon className="w-8 h-8 text-muted-foreground/50" />
          </div>
        )}

        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Logo - only show if no cover photo (otherwise it's on the cover) */}
            {!venue.cover_photo_url && venue.logo_url && (
              <img
                src={venue.logo_url}
                alt=""
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
            )}

            <div className="flex-1 min-w-0">
              {/* Name and verified badge */}
              <h3 className="font-semibold truncate flex items-center gap-1.5">
                {venue.name}
                {venue.is_verified && (
                  <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </h3>

              {/* Type - subtle, muted text only */}
              <p className="text-sm text-muted-foreground mt-0.5">
                {t(`types.${venue.venue_type}`)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
