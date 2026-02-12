import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MomentsViewContainer } from "@/components/moments/moments-view-container";
import { MusicPlayButton } from "@/components/audio/music-play-button";
import { JsonLd, generateCinemaAlbumSchema } from "@/lib/structured-data";
import type { Event, MomentWithProfile, EventSettings } from "@/lib/types";
import type { AudioTrack, PlaylistInfo } from "@/lib/stores/audio-player-store";

const INITIAL_PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<{ view?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createStaticClient();
  if (!supabase) return { title: "Moments" };

  const { data: event } = await supabase
    .from("events")
    .select("id, title, image_url, location_name, starts_at")
    .eq("slug", slug)
    .single();

  if (!event) {
    return { title: "Moments" };
  }

  const { count } = await supabase
    .from("moments")
    .select("*", { count: "exact", head: true })
    .eq("status", "published")
    .eq("event_id", event.id);

  const momentCount = count ?? 0;
  const title = `${event.title} — ${momentCount} Moments | ĐàLạt.app`;
  const description = `Watch ${momentCount} photos and videos from ${event.title}${event.location_name ? ` in ${event.location_name}` : ""} in cinema mode. A collaborative photo album powered by ĐàLạt.app.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(event.image_url && { images: [{ url: event.image_url, width: 1200, height: 630 }] }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(event.image_url && { images: [event.image_url] }),
    },
  };
}

async function getEvent(slug: string): Promise<Event | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .single();

  return data as Event | null;
}

async function getEventSettings(eventId: string): Promise<EventSettings | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("event_settings")
    .select("*")
    .eq("event_id", eventId)
    .single();

  return data as EventSettings | null;
}

async function getMoments(eventId: string): Promise<{ moments: MomentWithProfile[]; hasMore: boolean; totalCount: number }> {
  const supabase = await createClient();

  // Fetch moments and total count in parallel
  const [momentsResult, countResult] = await Promise.all([
    supabase.rpc("get_event_moments", {
      p_event_id: eventId,
      p_limit: INITIAL_PAGE_SIZE,
      p_offset: 0,
    }),
    supabase
      .from("moments")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "published"),
  ]);

  const moments = (momentsResult.data ?? []) as MomentWithProfile[];
  const totalCount = countResult.count ?? moments.length;
  // If we got exactly PAGE_SIZE, there might be more
  const hasMore = moments.length === INITIAL_PAGE_SIZE;

  return { moments, hasMore, totalCount };
}

async function getEventPlaylist(
  eventSlug: string,
  eventTitle: string,
  eventImageUrl: string | null
): Promise<{ tracks: AudioTrack[]; playlistInfo: PlaylistInfo } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_event_playlist", {
    p_event_slug: eventSlug,
  });

  if (error || !data || data.length === 0) return null;

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
      lyrics_lrc: row.track_lyrics_lrc,
      timing_offset: row.track_timing_offset || 0,
    }));

  if (tracks.length === 0) return null;

  return {
    tracks,
    playlistInfo: {
      eventSlug,
      eventTitle,
      eventImageUrl,
    },
  };
}

async function canUserPost(eventId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  // Check via RPC or settings
  const settings = await getEventSettings(eventId);

  // If settings exist and moments_enabled is explicitly false, only creator can post
  if (settings && !settings.moments_enabled) {
    const { data: event } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", eventId)
      .single();

    return event?.created_by === user.id;
  }

  // Default to 'anyone' if no settings exist (moments enabled by default)
  const whoCanPost = settings?.moments_who_can_post ?? "anyone";

  // Check based on who_can_post
  switch (whoCanPost) {
    case "anyone":
      return true;
    case "rsvp":
      const { data: rsvp } = await supabase
        .from("rsvps")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .single();
      return rsvp?.status && ["going", "waitlist", "interested"].includes(rsvp.status);
    case "confirmed":
      const { data: confirmedRsvp } = await supabase
        .from("rsvps")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .single();
      return confirmedRsvp?.status === "going";
    default:
      return false;
  }
}

export default async function EventMomentsPage({ params, searchParams }: PageProps) {
  const { slug, locale } = await params;
  const { view } = await searchParams;
  const event = await getEvent(slug);

  if (!event) {
    notFound();
  }

  const t = await getTranslations("moments");

  const [{ moments, hasMore, totalCount }, canPost, playlist] = await Promise.all([
    getMoments(event.id),
    canUserPost(event.id),
    getEventPlaylist(event.slug, event.title, event.image_url),
  ]);

  const firstTrackUrl = playlist?.tracks[0]?.file_url;

  return (
    <main className="min-h-screen">
      {/* Preload first audio track so playback starts instantly */}
      {firstTrackUrl && (
        <link rel="preload" href={firstTrackUrl} as="fetch" crossOrigin="anonymous" />
      )}
      <JsonLd
        data={generateCinemaAlbumSchema(
          event,
          moments,
          totalCount,
          locale
        )}
      />
      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* Title */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{t("moments")}</h1>
            <MusicPlayButton />
            {canPost && (
              <Link href={`/events/${slug}/moments/new`} className="ml-auto">
                <Button size="sm" variant="outline" className="active:scale-95 transition-transform">
                  <Plus className="w-4 h-4 mr-1" />
                  {t("addMoment")}
                </Button>
              </Link>
            )}
          </div>
          <Link
            href={`/events/${slug}`}
            className="text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            {event.title} &rarr;
          </Link>
        </div>

        {/* Moments view with grid/immersive toggle */}
        <MomentsViewContainer
          eventId={event.id}
          eventSlug={event.slug}
          initialMoments={moments}
          initialHasMore={hasMore}
          totalCount={totalCount}
          initialView={
            view === "immersive" ? "immersive" :
            view === "cinema" ? "cinema" :
            undefined
          }
          eventMeta={{
            title: event.title,
            date: event.starts_at,
            locationName: event.location_name,
            imageUrl: event.image_url,
          }}
          initialPlaylist={playlist}
        />

        {/* CTA for users who can post but haven't yet */}
        {moments.length === 0 && canPost && (
          <div className="mt-6 text-center">
            <Link href={`/events/${slug}/moments/new`}>
              <Button size="lg" className="active:scale-95 transition-transform">
                <Plus className="w-5 h-5 mr-2" />
                {t("shareYourMoment")}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
