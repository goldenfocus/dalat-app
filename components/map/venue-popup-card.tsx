"use client";

import { Link } from "@/lib/i18n/routing";
import { X, Route, ExternalLink, BadgeCheck, Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { triggerHaptic } from "@/lib/haptics";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import type { VenueMapMarker } from "@/lib/types";

interface VenuePopupCardProps {
  venue: VenueMapMarker;
  onClose: () => void;
}

export function VenuePopupCard({ venue, onClose }: VenuePopupCardProps) {
  const t = useTranslations("venues");
  const tMap = useTranslations("mapPage");
  const typeConfig = getVenueTypeConfig(venue.venue_type);
  const TypeIcon = typeConfig.icon;

  return (
    <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-background rounded-xl shadow-xl border border-border overflow-hidden">
      <Link href={`/venues/${venue.slug}`} className="block" onClick={() => triggerHaptic("selection")}>
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Logo or type icon */}
            {venue.logo_url ? (
              <img
                src={venue.logo_url}
                alt=""
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${typeConfig.bgColor} ${typeConfig.darkBgColor}`}
              >
                <TypeIcon
                  className={`w-6 h-6 ${typeConfig.color} ${typeConfig.darkColor}`}
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Name and verified badge */}
              <h3 className="font-semibold text-sm flex items-center gap-1.5 line-clamp-1">
                {venue.name}
                {venue.is_verified && (
                  <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </h3>

              {/* Type badge */}
              <span
                className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded mt-1 ${typeConfig.bgColor} ${typeConfig.darkBgColor} ${typeConfig.color} ${typeConfig.darkColor}`}
              >
                <TypeIcon className="w-3 h-3" />
                {typeConfig.label}
              </span>

              {/* Event count */}
              {venue.upcoming_event_count > 0 ? (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {venue.upcoming_event_count} upcoming {venue.upcoming_event_count === 1 ? "event" : "events"}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  No upcoming events
                </p>
              )}

              {/* Happening now indicator */}
              {venue.has_happening_now && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mt-1">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  {t("happeningNow")}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Map action buttons */}
      <div className="flex border-t border-border">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic("selection");
          }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors active:scale-95"
          title="Get directions"
        >
          <Route className="w-4 h-4" />
          <span>{tMap("directions")}</span>
        </a>
        <div className="w-px bg-border" />
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.stopPropagation();
            triggerHaptic("selection");
          }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors active:scale-95"
          title="Open in Google Maps"
        >
          <ExternalLink className="w-4 h-4" />
          <span>{tMap("openInMaps")}</span>
        </a>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic("selection");
          onClose();
        }}
        className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
