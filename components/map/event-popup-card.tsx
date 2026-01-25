"use client";

import { Link } from "@/lib/i18n/routing";
import { X, Route } from "lucide-react";
import { useTranslations } from "next-intl";
import { triggerHaptic } from "@/lib/haptics";
import { formatInDaLat } from "@/lib/timezone";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { Event } from "@/lib/types";

interface EventPopupCardProps {
  event: Event;
  onClose: () => void;
}

export function EventPopupCard({ event, onClose }: EventPopupCardProps) {
  const t = useTranslations("mapPage");

  return (
    <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-background rounded-xl shadow-md border border-border/50 overflow-hidden">
      {/* Event image and details - clickable area */}
      <Link
        href={`/events/${event.slug}`}
        className="block"
        onClick={() => triggerHaptic("selection")}
      >
        {event.image_url && (
          <div className="h-32 bg-muted">
            <img
              src={event.image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-3">
          <h3 className="font-semibold text-sm line-clamp-2 mb-1">
            {event.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            {formatInDaLat(event.starts_at, "EEE, MMM d · h:mm a")}
          </p>
          {event.location_name && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              📍 {decodeUnicodeEscapes(event.location_name)}
            </p>
          )}
        </div>
      </Link>

      {/* Action buttons - simplified to primary CTA + directions */}
      <div className="flex border-t border-border/50">
        {/* View Event - primary CTA */}
        <Link
          href={`/events/${event.slug}`}
          onClick={() => triggerHaptic("selection")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors active:scale-95"
        >
          {t("viewEvent")}
        </Link>

        {/* Directions - secondary action */}
        {event.latitude && event.longitude && (
          <>
            <div className="w-px bg-border/50" />
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`}
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
              <span>{t("directions")}</span>
            </a>
          </>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic("selection");
          onClose();
        }}
        className="absolute top-2 right-2 w-7 h-7 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center active:scale-95 transition-all"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
