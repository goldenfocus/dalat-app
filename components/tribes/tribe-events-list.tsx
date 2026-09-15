"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Calendar, MapPin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { decodeUnicodeEscapes } from "@/lib/utils";
import { DALAT_TIMEZONE } from "@/lib/timezone";
import type { Event, Profile } from "@/lib/types";

interface TribeEventsListProps {
  events: (Event & { profiles?: Profile })[];
  locale: string;
}

export function TribeEventsList({ events, locale }: TribeEventsListProps) {
  const t = useTranslations("tribes");
  const feed = useTranslations("feed");
  const [showAll, setShowAll] = useState(false);
  const sortedEvents = [...events].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const visibleEvents = showAll ? sortedEvents : sortedEvents.slice(0, 3);

  if (events.length === 0) {
    return <p className="text-center py-8 text-muted-foreground">{t("noEvents")}</p>;
  }

  return (
    <div className="space-y-4">
      {visibleEvents.map((event) => {
        const eventDate = new Date(event.starts_at);
        const formattedDate = eventDate.toLocaleDateString(locale, {
          weekday: "short", month: "short", day: "numeric", timeZone: DALAT_TIMEZONE,
        });
        const formattedTime = eventDate.toLocaleTimeString(locale, {
          hour: "numeric", minute: "2-digit", hour12: true, timeZone: DALAT_TIMEZONE,
        });

        return (
          <Link
            key={event.id}
            href={`/${locale}/events/${event.slug}`}
            className="block p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors active:scale-[0.99]"
          >
            <div className="flex gap-4">
              <div className="relative w-16 h-20 sm:w-20 sm:h-24 bg-muted rounded-lg overflow-hidden shrink-0">
                {event.image_url ? <Image src={event.image_url} alt="" fill sizes="(max-width: 639px) 64px, 80px" className="object-cover" /> : <div className="flex h-full items-center justify-center"><Calendar className="h-6 w-6 text-muted-foreground" aria-hidden="true" /></div>}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold line-clamp-2">{event.title}</h3>

                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    {t("dateAtTime", { date: formattedDate, time: formattedTime })}
                  </span>
                </div>

                {event.location_name && (
                  <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{decodeUnicodeEscapes(event.location_name)}</span>
                  </div>
                )}

                {event.profiles && (
                  <div className="flex items-center gap-2 mt-2">
                    <Avatar className="w-5 h-5">
                      <AvatarImage src={event.profiles.avatar_url || undefined} />
                      <AvatarFallback>{event.profiles.display_name?.charAt(0) || "?"}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">
                      {event.profiles.display_name || "Unknown"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Link>
        );
      })}
      {!showAll && sortedEvents.length > 3 && <Button variant="outline" className="min-h-11 w-full" onClick={() => setShowAll(true)}>{feed("viewAll")}</Button>}
    </div>
  );
}
