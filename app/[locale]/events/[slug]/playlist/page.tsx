import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PlaylistPlayer } from "@/components/events/playlist-player";
import { PlaylistShareButton } from "@/components/events/playlist-share-button";
import { formatInDaLat } from "@/lib/timezone";
import type { PlaylistTrack } from "@/components/events/playlist-player";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

interface PlaylistData {
  event: {
    id: string;
    title: string;
    image_url: string | null;
    starts_at: string;
    location_name: string | null;
  };
  playlist: {
    id: string;
    title: string | null;
    description: string | null;
  } | null;
  tracks: PlaylistTrack[];
}

async function getEventPlaylist(slug: string): Promise<PlaylistData | null> {
  const supabase = await createClient();

  // Use the database function that joins playlist + tracks
  const { data, error } = await supabase.rpc("get_event_playlist", {
    p_event_slug: slug,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  // All rows have the same event/playlist info, extract from first row
  const firstRow = data[0];

  // If no tracks exist, firstRow.track_id will be null (LEFT JOIN)
  const tracks: PlaylistTrack[] = data
    .filter((row: any) => row.track_id !== null)
    .map((row: any) => ({
      id: row.track_id,
      file_url: row.track_file_url,
      title: row.track_title,
      artist: row.track_artist,
      album: row.track_album,
      thumbnail_url: row.track_thumbnail_url,
      duration_seconds: row.track_duration_seconds,
      sort_order: row.track_sort_order,
      lyrics_lrc: row.track_lyrics_lrc,  // LRC for karaoke display
    }));

  return {
    event: {
      id: firstRow.event_id,
      title: firstRow.event_title,
      image_url: firstRow.event_image_url,
      starts_at: firstRow.event_starts_at,
      location_name: firstRow.event_location_name,
    },
    playlist: firstRow.playlist_id
      ? {
          id: firstRow.playlist_id,
          title: firstRow.playlist_title,
          description: firstRow.playlist_description,
        }
      : null,
    tracks,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const data = await getEventPlaylist(slug);

  if (!data) {
    return { title: "Playlist not found" };
  }

  const { event, tracks } = data;
  const totalDuration = tracks.reduce((acc, track) => acc + (track.duration_seconds || 0), 0);
  const durationMinutes = Math.round(totalDuration / 60);

  const title = `${event.title} - Playlist`;
  const description = `Listen to ${tracks.length} audio track${tracks.length !== 1 ? "s" : ""} from ${event.title}${durationMinutes > 0 ? ` (${durationMinutes} min)` : ""}`;

  const canonicalUrl = `https://dalat.app/${locale}/events/${slug}/playlist`;

  // Use first track's thumbnail, or event image, or generated OG
  const ogImageUrl = tracks[0]?.thumbnail_url
    || event.image_url
    || `https://dalat.app/${locale}/events/${slug}/playlist/opengraph-image`;

  return {
    title: `${title} | ĐàLạt.app`,
    description,
    openGraph: {
      title,
      description,
      type: "music.playlist",
      url: canonicalUrl,
      siteName: "ĐàLạt.app",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function PlaylistPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const t = await getTranslations("playlist");
  const tc = await getTranslations("common");

  const data = await getEventPlaylist(slug);

  if (!data || data.tracks.length === 0) {
    notFound();
  }

  const { event, tracks } = data;
  const eventDate = formatInDaLat(event.starts_at, "EEE, MMM d, yyyy");

  // Build playlist URL for sharing
  const playlistUrl = `https://dalat.app/${locale}/events/${slug}/playlist`;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto px-4 py-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/events/${slug}`}
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tc("back")}</span>
          </Link>

          <PlaylistShareButton
            title={`${event.title} - ${t("title")}`}
            url={playlistUrl}
            trackCount={tracks.length}
          />
        </div>

        {/* Event Info */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">{event.title}</h1>
          <p className="text-muted-foreground text-sm">
            {eventDate}
            {event.location_name && ` · ${event.location_name}`}
          </p>
        </div>

        {/* Playlist Player */}
        <PlaylistPlayer
          tracks={tracks}
          eventSlug={slug}
          eventTitle={event.title}
          eventImageUrl={event.image_url}
        />

        {/* Back to event link */}
        <div className="mt-8 text-center">
          <Link
            href={`/events/${slug}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View full event details &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
