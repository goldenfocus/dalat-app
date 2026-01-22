import { Link } from "@/lib/i18n/routing";
import { Calendar, BadgeCheck, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInDaLat } from "@/lib/timezone";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { Event, Organizer, Locale } from "@/lib/types";

interface MoreFromOrganizerProps {
  organizer: Organizer;
  events: Event[];
  currentEventId: string;
  locale?: Locale;
}

export function MoreFromOrganizer({
  organizer,
  events,
  currentEventId,
  locale,
}: MoreFromOrganizerProps) {
  // Filter out current event and get up to 3 upcoming events
  const upcomingEvents = events
    .filter((e) => e.id !== currentEventId && e.status === "published")
    .filter((e) => new Date(e.starts_at) > new Date())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 3);

  if (upcomingEvents.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span>More from</span>
          {organizer.logo_url ? (
            <img
              src={organizer.logo_url}
              alt={organizer.name}
              className="w-5 h-5 rounded-full"
            />
          ) : null}
          <span className="font-semibold">{organizer.name}</span>
          {organizer.is_verified && (
            <BadgeCheck className="w-4 h-4 text-primary" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {upcomingEvents.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="block p-3 -mx-3 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="flex gap-3">
              {event.image_url && (
                <img
                  src={event.image_url}
                  alt=""
                  className="w-12 h-12 rounded object-cover shrink-0"
                />
              )}
              <div className="min-w-0">
                <p className="font-medium truncate">{event.title}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatInDaLat(event.starts_at, "MMM d", locale)}
                  {event.location_name && ` · ${decodeUnicodeEscapes(event.location_name)}`}
                </p>
              </div>
            </div>
          </Link>
        ))}

        {/* View all link */}
        <Link
          href={`/organizers/${organizer.slug}`}
          className="flex items-center justify-center gap-1 text-sm text-primary hover:underline pt-2"
        >
          View all events
          <ArrowRight className="w-3 h-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
