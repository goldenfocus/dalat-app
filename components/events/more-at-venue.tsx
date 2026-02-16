import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInDaLat } from "@/lib/timezone";
import { decodeUnicodeEscapes } from "@/lib/utils";
import { createStaticClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/types";

interface MoreAtVenueProps {
  venueId: string;
  venueName: string;
  venueSlug: string;
  currentEventId: string;
  locale?: Locale;
}

/**
 * Shows upcoming events at the same venue.
 * Provides internal cross-linking for SEO — search engines can discover
 * all events at a venue from any single event page.
 */
export async function MoreAtVenue({
  venueId,
  venueName,
  venueSlug,
  currentEventId,
  locale,
}: MoreAtVenueProps) {
  const supabase = createStaticClient();
  if (!supabase) return null;

  const { data: events } = await supabase
    .from("events")
    .select("id, slug, title, image_url, starts_at, location_name")
    .eq("venue_id", venueId)
    .eq("status", "published")
    .neq("id", currentEventId)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(3);

  if (!events || events.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span>More at</span>
          <Link
            href={`/venues/${venueSlug}`}
            className="font-semibold hover:underline"
          >
            {decodeUnicodeEscapes(venueName)}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {events.map((event) => (
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

        <Link
          href={`/venues/${venueSlug}`}
          className="flex items-center justify-center gap-1 text-sm text-primary hover:underline pt-2"
        >
          All events at this venue
          <ArrowRight className="w-3 h-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
