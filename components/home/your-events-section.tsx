"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatInDaLat } from "@/lib/timezone";
import { optimizedImageUrl } from "@/lib/image-cdn";
import type { Event, EventCounts, Locale } from "@/lib/types";

interface UserEvent extends Event {
  rsvp_status: "going" | "interested" | "waitlist";
}

interface YourEventsSectionProps {
  locale: string;
}

/**
 * "Your Events" section showing user's upcoming RSVP'd events.
 * Client component - fetches user-specific data dynamically.
 * Only renders for logged-in users with upcoming events.
 */
export function YourEventsSection({ locale: _locale }: YourEventsSectionProps) {
  const t = useTranslations("home");
  const tRsvp = useTranslations("rsvp");
  const tEvents = useTranslations("events");
  const locale = useLocale() as Locale;

  const [events, setEvents] = useState<UserEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, EventCounts>>({});
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    async function fetchUserEvents() {
      const supabase = createClient();

      // Check auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setIsLoggedIn(true);

      // Fetch user's upcoming RSVPs with event data
      const now = new Date().toISOString();
      const { data: rsvps, error } = await supabase
        .from("rsvps")
        .select(`
          status,
          events!inner (
            id,
            slug,
            title,
            image_url,
            starts_at,
            ends_at,
            location_name,
            capacity,
            status
          )
        `)
        .eq("user_id", user.id)
        .in("status", ["going", "interested", "waitlist"])
        .gte("events.starts_at", now)
        .eq("events.status", "published")
        .order("events(starts_at)", { ascending: true })
        .limit(5);

      if (error || !rsvps) {
        console.error("Error fetching user events:", error);
        setLoading(false);
        return;
      }

      // Transform data
      type RsvpWithEvent = {
        status: string;
        events: Event | null;
      };
      const userEvents: UserEvent[] = (rsvps as RsvpWithEvent[])
        .filter((r) => r.events)
        .map((r) => ({
          ...(r.events as Event),
          rsvp_status: r.status as UserEvent["rsvp_status"],
        }));

      setEvents(userEvents);

      // Fetch counts for these events
      if (userEvents.length > 0) {
        const eventIds = userEvents.map((e) => e.id);
        const { data: countData } = await supabase.rpc("get_event_counts_batch", {
          p_event_ids: eventIds,
        });

        if (countData) {
          const countsMap: Record<string, EventCounts> = {};
          for (const row of countData) {
            countsMap[row.event_id] = row;
          }
          setCounts(countsMap);
        }
      }

      setLoading(false);
    }

    fetchUserEvents();
  }, []);

  // Don't render anything if not logged in or no events
  if (!isLoggedIn || loading || events.length === 0) {
    return null;
  }

  return (
    <section className="mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold tracking-tight">
            {t("yourEvents.title")}
          </h2>
          <span className="bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-full">
            {events.length}
          </span>
        </div>
        {events.length >= 3 && (
          <Link
            href="/profile"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("yourEvents.seeAll")}
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Events list - compact cards */}
      <div className="space-y-2">
        {events.map((event) => (
          <YourEventCard
            key={event.id}
            event={event}
            counts={counts[event.id]}
            locale={locale}
            tRsvp={tRsvp}
            tEvents={tEvents}
          />
        ))}
      </div>
    </section>
  );
}

interface YourEventCardProps {
  event: UserEvent;
  counts?: EventCounts;
  locale: Locale;
  tRsvp: ReturnType<typeof useTranslations>;
  tEvents: ReturnType<typeof useTranslations>;
}

function YourEventCard({ event, counts, locale, tRsvp, tEvents }: YourEventCardProps) {
  const imageUrl = event.image_url
    ? optimizedImageUrl(event.image_url, { width: 120, quality: 70 })
    : null;

  // Format date and time in Da Lat timezone
  const dateStr = formatInDaLat(event.starts_at, "EEE, MMM d", locale);
  const timeStr = formatInDaLat(event.starts_at, "h:mm a", locale);

  // RSVP status badge
  const statusConfig = {
    going: {
      label: tRsvp("youreGoing"),
      className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    },
    interested: {
      label: tRsvp("youreInterested"),
      className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
    },
    waitlist: {
      label: tEvents("onWaitlist"),
      className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    },
  };

  const status = statusConfig[event.rsvp_status];
  const goingCount = counts?.going_spots ?? 0;

  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex gap-3 p-2 -mx-2 rounded-lg hover:bg-muted/50 active:bg-muted transition-colors group"
    >
      {/* Event image */}
      <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={event.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CalendarCheck className="w-6 h-6 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Event info */}
      <div className="flex-1 min-w-0 py-0.5">
        {/* Title */}
        <h3 className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
          {event.title}
        </h3>

        {/* Date & Time */}
        <p className="text-xs text-muted-foreground mt-0.5">
          {dateStr} · {timeStr}
        </p>

        {/* Status badge + attendee count */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${status.className}`}>
            {status.label}
          </span>
          {goingCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {goingCount} {tEvents("going")}
            </span>
          )}
        </div>
      </div>

      {/* Arrow indicator */}
      <div className="flex items-center text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
        <ChevronRight className="w-4 h-4" />
      </div>
    </Link>
  );
}
