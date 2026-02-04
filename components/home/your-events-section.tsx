"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { CalendarCheck, ChevronRight, ChevronDown, Music, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatInDaLat } from "@/lib/timezone";
import { optimizedImageUrl } from "@/lib/image-cdn";
import { triggerHaptic } from "@/lib/haptics";
import { useAudioPlayerStore, type AudioTrack, type PlaylistInfo } from "@/lib/stores/audio-player-store";
import type { Event, EventCounts, Locale } from "@/lib/types";

interface UserEvent extends Event {
  rsvp_status: "going" | "interested" | "waitlist";
  has_playlist?: boolean;
}

interface YourEventsSectionProps {
  locale: string;
}

// Show 2 events by default, expandable to show all
const DEFAULT_VISIBLE = 2;

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
  const [expanded, setExpanded] = useState(false);

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

      // Fetch user's RSVPs with event data
      const { data: rsvps, error } = await supabase
        .from("rsvps")
        .select(`
          status,
          events (
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
        .in("status", ["going", "interested", "waitlist"]);

      if (error) {
        console.error("[YourEvents] Error fetching RSVPs:", error);
        setLoading(false);
        return;
      }

      if (!rsvps || rsvps.length === 0) {
        setLoading(false);
        return;
      }

      // Transform and filter data client-side for reliability
      const now = new Date();
      type RsvpWithEvent = {
        status: string;
        events: Event | null;
      };

      const userEvents: UserEvent[] = (rsvps as RsvpWithEvent[])
        .filter((r) => {
          if (!r.events) return false;
          // Only upcoming events that are published
          const eventDate = new Date(r.events.starts_at);
          return eventDate > now && r.events.status === "published";
        })
        .map((r) => ({
          ...(r.events as Event),
          rsvp_status: r.status as UserEvent["rsvp_status"],
        }))
        // Sort by start date (soonest first)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

      setEvents(userEvents);

      // Fetch counts and playlist info for these events
      if (userEvents.length > 0) {
        const eventIds = userEvents.map((e) => e.id);

        // Fetch counts and playlist info in parallel
        const [countResult, playlistResult] = await Promise.all([
          supabase.rpc("get_event_counts_batch", { p_event_ids: eventIds }),
          supabase
            .from("event_playlists")
            .select("event_id, playlist_tracks(id)")
            .in("event_id", eventIds),
        ]);

        if (countResult.data) {
          const countsMap: Record<string, EventCounts> = {};
          for (const row of countResult.data) {
            countsMap[row.event_id] = row;
          }
          setCounts(countsMap);
        }

        // Mark events that have playlists with tracks
        if (playlistResult.data) {
          const playlistEventIds = new Set(
            playlistResult.data
              .filter((p: any) => p.playlist_tracks && p.playlist_tracks.length > 0)
              .map((p: any) => p.event_id)
          );
          setEvents((prev) =>
            prev.map((e) => ({
              ...e,
              has_playlist: playlistEventIds.has(e.id),
            }))
          );
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

  const visibleEvents = expanded ? events : events.slice(0, DEFAULT_VISIBLE);
  const hasMore = events.length > DEFAULT_VISIBLE;

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
        <Link
          href="/profile"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("yourEvents.seeAll")}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Events list - compact cards */}
      <div className="space-y-2">
        {visibleEvents.map((event) => (
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

      {/* Show more/less button */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
        >
          {expanded ? (
            <>Show less</>
          ) : (
            <>
              Show {events.length - DEFAULT_VISIBLE} more
              <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
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
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const setPlaylist = useAudioPlayerStore((state) => state.setPlaylist);

  const imageUrl = event.image_url
    ? optimizedImageUrl(event.image_url, { width: 120, quality: 70 })
    : null;

  // Handle instant playlist play
  const handlePlayPlaylist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    triggerHaptic("selection");

    if (isLoadingPlaylist) return;
    setIsLoadingPlaylist(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_event_playlist", {
        p_event_slug: event.slug,
      });

      if (error || !data || data.length === 0) {
        console.error("[YourEvents] Error fetching playlist:", error);
        return;
      }

      // Transform to AudioTrack format
      const tracks: AudioTrack[] = data
        .filter((row: any) => row.track_id !== null)
        .map((row: any) => ({
          id: row.track_id,
          file_url: row.track_file_url,
          title: row.track_title,
          artist: row.track_artist,
          album: row.track_album,
          thumbnail_url: row.track_thumbnail_url,
          duration_seconds: row.track_duration_seconds,
        }));

      if (tracks.length === 0) return;

      const playlistInfo: PlaylistInfo = {
        eventSlug: event.slug,
        eventTitle: event.title,
        eventImageUrl: event.image_url,
      };

      // Start playback - this shows mini-player and auto-plays
      setPlaylist(tracks, playlistInfo, 0);
    } catch (err) {
      console.error("[YourEvents] Error playing playlist:", err);
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

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

      {/* Play button or arrow indicator */}
      <div className="flex items-center gap-1">
        {event.has_playlist && (
          <button
            onClick={handlePlayPlaylist}
            disabled={isLoadingPlaylist}
            className="p-2 rounded-full text-primary hover:bg-primary/10 active:scale-95 transition-all touch-manipulation"
            aria-label="Play event playlist"
          >
            {isLoadingPlaylist ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Music className="w-5 h-5" />
            )}
          </button>
        )}
        <div className="flex items-center text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}
