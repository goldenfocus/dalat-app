"use client";

import { useLocale } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { formatInDaLat } from "@/lib/timezone";
import { hasLamVienTbdSchedule } from "@/lib/activity-graph/lam-vien-tbd";
import { decodeUnicodeEscapes } from "@/lib/utils";
import { optimizedImageUrl } from "@/lib/image-cdn";
import type { CalendarEvent } from "@/lib/calendar";
import type { Locale } from "@/lib/types";
import { ResilientImage } from "@/components/ui/resilient-image";
import { OriginalText } from "@/components/ui/original-text";
import { eventImageAlt } from "@/lib/events/image-alt";

export function CalendarEventCard({ event }: { event: CalendarEvent }) {
  const locale = useLocale() as Locale;
  return (
    <div className="rounded-lg border">
      <Link href={`/events/${event.slug}`} prefetch={false} className="block p-3 hover:bg-muted transition-colors">
        <div className="flex gap-3">
          {event.image_url && <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0 bg-muted">
            <ResilientImage src={optimizedImageUrl(event.image_url, { width: 192 })!} fallbackSrc={event.image_url} alt={eventImageAlt(event, event.title)} loading="lazy" className="w-full h-full object-cover" />
          </div>}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm line-clamp-2">{event.title}</h4>
            <p className="text-xs text-muted-foreground mt-1">
              {hasLamVienTbdSchedule(event.source_metadata) ? "TBD" : formatInDaLat(event.starts_at, "p", locale)}
              {event.location_name && ` · ${decodeUnicodeEscapes(event.location_name)}`}
            </p>
          </div>
        </div>
      </Link>
      {event.originalTitle && <OriginalText text={event.originalTitle} sourceLocale={event.source_locale ?? undefined} className="px-2" />}
    </div>
  );
}
