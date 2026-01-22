"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Calendar, MapPin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { Event, Profile } from "@/lib/types";

interface TribeEventsListProps {
  events: (Event & { profiles?: Profile })[];
  locale: string;
}

export function TribeEventsList({ events, locale }: TribeEventsListProps) {
  const t = useTranslations("tribes");

  if (events.length === 0) {
    return <p className="text-center py-8 text-muted-foreground">{t("noEvents")}</p>;
  }

  return (
    <div className="space-y-4">
      {events.map((event) => {
        const eventDate = new Date(event.starts_at);
        const formattedDate = eventDate.toLocaleDateString(
          locale === "vi" ? "vi-VN" : locale === "fr" ? "fr-FR" : "en-US",
          { weekday: "short", month: "short", day: "numeric" }
        );
        const formattedTime = eventDate.toLocaleTimeString(
          locale === "vi" ? "vi-VN" : locale === "fr" ? "fr-FR" : "en-US",
          { hour: "numeric", minute: "2-digit", hour12: true }
        );

        return (
          <Link
            key={event.id}
            href={`/${locale}/events/${event.slug}`}
            className="block p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors active:scale-[0.99]"
          >
            <div className="flex gap-4">
              {/* Date badge */}
              <div className="flex flex-col items-center justify-center w-14 h-14 bg-primary/10 rounded-lg shrink-0">
                <span className="text-xs font-medium text-primary uppercase">
                  {eventDate.toLocaleDateString(locale, { month: "short" })}
                </span>
                <span className="text-xl font-bold text-primary">
                  {eventDate.getDate()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{event.title}</h3>

                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formattedDate} at {formattedTime}
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
    </div>
  );
}
