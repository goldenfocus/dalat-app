import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { PlaylistPlayer } from "@/components/events/playlist-player";
import { PlaylistShareButton } from "@/components/events/playlist-share-button";
import { formatInDaLat } from "@/lib/timezone";
import type { PlaylistTrack } from "@/components/events/playlist-player";
import { JsonLd, generateMusicPlaylistSchema, generateBreadcrumbSchema } from "@/lib/structured-data";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<{ karaoke?: string; track?: string }>;
}

// RPC return type for get_event_playlist
interface PlaylistRpcRow {
  event_id: string;
  event_title: string;
  event_image_url: string | null;
  event_starts_at: string;
  event_location_name: string | null;
  playlist_id: string | null;
  playlist_title: string | null;
  playlist_description: string | null;
  track_id: string | null;
  track_file_url: string | null;
  track_title: string | null;
  track_artist: string | null;
  track_album: string | null;
  track_thumbnail_url: string | null;
  track_duration_seconds: number | null;
  track_sort_order: number | null;
  track_lyrics_lrc: string | null;
  track_timing_offset: number | null;
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

async function getEventPlaylist(slug: string, staticClient?: ReturnType<typeof createStaticClient>): Promise<PlaylistData | null> {
  const supabase = staticClient ?? await createClient();

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
  const tracks: PlaylistTrack[] = (data as PlaylistRpcRow[])
    .filter((row) => row.track_id !== null)
    .map((row) => ({
      id: row.track_id!,
      file_url: row.track_file_url!,
      title: row.track_title,
      artist: row.track_artist,
      album: row.track_album,
      thumbnail_url: row.track_thumbnail_url,
      duration_seconds: row.track_duration_seconds,
      sort_order: row.track_sort_order ?? 0,
      lyrics_lrc: row.track_lyrics_lrc,  // LRC for karaoke display
      timing_offset: row.track_timing_offset || 0,  // Saved timing offset
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

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const { karaoke, track } = await searchParams;
  const supabase = createStaticClient();
  if (!supabase) return { title: "Playlist" };
  const data = await getEventPlaylist(slug, supabase);

  if (!data) {
    return { title: "Playlist not found" };
  }

  const { event, tracks } = data;
  const totalDuration = tracks.reduce((acc, track) => acc + (track.duration_seconds || 0), 0);
  const durationMinutes = Math.round(totalDuration / 60);

  // Karaoke-specific metadata for SEO
  const isKaraokeMode = karaoke === "theater" || karaoke === "hero";
  const trackIndex = track ? parseInt(track, 10) : 0;
  const currentTrack = tracks[trackIndex] || tracks[0];

  // Build SEO-optimized title and description
  let title: string;
  let description: string;

  if (isKaraokeMode && currentTrack) {
    // Karaoke-specific SEO with Vietnamese keywords
    const trackTitle = currentTrack.title || "Bài hát";
    const artist = currentTrack.artist || event.title;

    title = locale === "vi"
      ? `🎤 Karaoke ${trackTitle} - ${artist} | Hát Karaoke Đà Lạt Online`
      : `🎤 Karaoke ${trackTitle} - ${artist} | Sing Along Da Lat`;

    description = locale === "vi"
      ? `Hát karaoke online ${trackTitle} với lời bài hát hiển thị theo nhạc. Karaoke Đà Lạt, nhạc Việt Nam, hát cùng bạn bè. ${tracks.length} bài hát từ ${event.title}.`
      : `Sing karaoke ${trackTitle} with synchronized lyrics display. Da Lat karaoke, Vietnamese music, sing along with friends. ${tracks.length} tracks from ${event.title}.`;
  } else {
    title = `${event.title} - Playlist`;
    description = locale === "vi"
      ? `Nghe ${tracks.length} bài nhạc từ ${event.title}${durationMinutes > 0 ? ` (${durationMinutes} phút)` : ""}. Karaoke online Đà Lạt, nhạc sự kiện.`
      : `Listen to ${tracks.length} audio track${tracks.length !== 1 ? "s" : ""} from ${event.title}${durationMinutes > 0 ? ` (${durationMinutes} min)` : ""}`;
  }

  const canonicalUrl = `https://dalat.app/${locale}/events/${slug}/playlist`;

  // Use first track's thumbnail, or event image, or generated OG
  const ogImageUrl = currentTrack?.thumbnail_url
    || event.image_url
    || `https://dalat.app/${locale}/events/${slug}/playlist/opengraph-image`;

  // SEO keywords for karaoke + Dalat
  const keywords = [
    "karaoke đà lạt",
    "karaoke online",
    "hát karaoke",
    "dalat karaoke",
    "nhạc việt nam",
    "vietnamese karaoke",
    "sing along",
    "lời bài hát",
    "lyrics display",
    event.title,
    currentTrack?.artist,
    currentTrack?.title,
  ].filter(Boolean);

  return {
    title: `${title} | ĐàLạt.app`,
    description,
    keywords: keywords.join(", "),
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
          alt: isKaraokeMode
            ? `Karaoke ${currentTrack?.title || event.title}`
            : `${event.title} playlist`,
        },
      ],
      locale: locale === "vi" ? "vi_VN" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        vi: `https://dalat.app/vi/events/${slug}/playlist${karaoke ? `?karaoke=${karaoke}` : ""}`,
        en: `https://dalat.app/en/events/${slug}/playlist${karaoke ? `?karaoke=${karaoke}` : ""}`,
      },
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function PlaylistPage({ params, searchParams }: PageProps) {
  const { slug, locale } = await params;
  const { karaoke, track } = await searchParams;
  const t = await getTranslations("playlist");
  const tc = await getTranslations("common");

  const data = await getEventPlaylist(slug);

  if (!data || data.tracks.length === 0) {
    notFound();
  }

  const { event, tracks } = data;
  const eventDate = formatInDaLat(event.starts_at, "EEE, MMM d, yyyy");

  // Parse karaoke mode from URL (theater=2, hero=3)
  const karaokeLevel = karaoke === "hero" ? 3 : karaoke === "theater" ? 2 : undefined;
  const startTrack = track ? parseInt(track, 10) : undefined;

  // Build playlist URL for sharing
  const playlistUrl = `https://dalat.app/${locale}/events/${slug}/playlist`;
  const isKaraokeMode = karaoke === "theater" || karaoke === "hero";

  // Generate structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Events", url: "/events/upcoming" },
      { name: event.title, url: `/events/${slug}` },
      { name: "Playlist", url: `/events/${slug}/playlist` },
    ],
    locale
  );

  const playlistSchema = generateMusicPlaylistSchema(
    tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration_seconds: t.duration_seconds,
      thumbnail_url: t.thumbnail_url,
    })),
    {
      slug,
      title: event.title,
      image_url: event.image_url,
    },
    locale
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, playlistSchema]} />
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

        {/* Event Info with SEO headings */}
        <div className="mb-6">
          {isKaraokeMode ? (
            <>
              <h1 className="text-2xl font-bold mb-1">
                🎤 Karaoke: {event.title}
              </h1>
              <p className="text-muted-foreground text-sm mb-2">
                {eventDate}
                {event.location_name && ` · ${event.location_name}`}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {locale === "vi"
                  ? "Hát karaoke online với lời bài hát đồng bộ • Karaoke Đà Lạt"
                  : "Sing along with synchronized lyrics • Da Lat Karaoke"}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-1">{event.title}</h1>
              <p className="text-muted-foreground text-sm">
                {eventDate}
                {event.location_name && ` · ${event.location_name}`}
              </p>
            </>
          )}
        </div>

        {/* Playlist Player */}
        <PlaylistPlayer
          tracks={tracks}
          eventSlug={slug}
          eventTitle={event.title}
          eventImageUrl={event.image_url}
          autoPlay={karaokeLevel !== undefined}
          autoKaraokeLevel={karaokeLevel}
          autoStartTrack={startTrack}
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
    </>
  );
}
