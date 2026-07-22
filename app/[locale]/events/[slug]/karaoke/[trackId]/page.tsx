import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { KaraokePageClient } from "./karaoke-page-client";
import { JsonLd, generateMusicRecordingSchema } from "@/lib/structured-data";
import { getLyricsTranslationsMap } from "@/lib/karaoke/lyrics-translations";

interface PageProps {
  params: Promise<{ slug: string; locale: string; trackId: string }>;
}

// RPC return type for get_event_playlist
interface PlaylistRpcRow {
  event_id: string;
  event_title: string;
  event_image_url: string | null;
  playlist_id: string | null;
  track_id: string | null;
  track_title: string | null;
  track_artist: string | null;
  track_file_url: string | null;
  track_thumbnail_url: string | null;
  track_duration_seconds: number | null;
  track_lyrics_lrc: string | null;
  track_sort_order: number | null;
}

interface TrackData {
  track: {
    id: string;
    title: string | null;
    artist: string | null;
    file_url: string;
    thumbnail_url: string | null;
    duration_seconds: number | null;
    lyrics_lrc: string | null;
  };
  event: {
    id: string;
    slug: string;
    title: string;
    image_url: string | null;
  };
  playlist: {
    id: string;
    tracks: Array<{
      id: string;
      title: string | null;
      artist: string | null;
      file_url: string;
      thumbnail_url: string | null;
      duration_seconds: number | null;
      lyrics_lrc: string | null;
      sort_order: number;
    }>;
  };
  trackIndex: number;
}

async function getKaraokeTrack(eventSlug: string, trackId: string, staticClient?: ReturnType<typeof createStaticClient>): Promise<TrackData | null> {
  const supabase = staticClient ?? await createClient();

  // Get event playlist with all tracks
  const { data, error } = await supabase.rpc("get_event_playlist", {
    p_event_slug: eventSlug,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const firstRow = data[0];

  // Build tracks array
  const tracks = (data as PlaylistRpcRow[])
    .filter((row) => row.track_id !== null)
    .map((row) => ({
      id: row.track_id!,
      title: row.track_title,
      artist: row.track_artist,
      file_url: row.track_file_url!,
      thumbnail_url: row.track_thumbnail_url,
      duration_seconds: row.track_duration_seconds,
      lyrics_lrc: row.track_lyrics_lrc,
      sort_order: row.track_sort_order ?? 0,
    }));

  // Find the requested track
  const trackIndex = tracks.findIndex((t) => t.id === trackId);
  if (trackIndex === -1) {
    return null;
  }

  const track = tracks[trackIndex];

  return {
    track,
    event: {
      id: firstRow.event_id,
      slug: eventSlug,
      title: firstRow.event_title,
      image_url: firstRow.event_image_url,
    },
    playlist: {
      id: firstRow.playlist_id,
      tracks,
    },
    trackIndex,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale, trackId: rawTrackId } = await params;
  const uuidMatch = rawTrackId.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  const trackId = uuidMatch ? uuidMatch[1] : rawTrackId;
  const supabase = createStaticClient();
  if (!supabase) return { title: "Karaoke" };
  const data = await getKaraokeTrack(slug, trackId, supabase);

  if (!data) {
    return { title: "Karaoke not found" };
  }

  const { track, event } = data;
  const trackTitle = track.title || "Bài hát";
  const artist = track.artist || event.title;
  const t = await getTranslations({ locale, namespace: "playlist.karaoke" });

  // SEO-optimized title with Vietnamese/English
  const title = t("metaTitle", { trackTitle, artist });

  const description = t("metaDescription", { trackTitle, eventTitle: event.title });

  const canonicalUrl = `https://dalat.app/${locale}/events/${slug}/karaoke/${trackId}`;
  const ogImageUrl = track.thumbnail_url || event.image_url || `https://dalat.app/${locale}/events/${slug}/playlist/opengraph-image`;

  // Rich keywords
  const keywords = [
    "karaoke đà lạt",
    "karaoke online",
    "hát karaoke",
    "dalat karaoke",
    "nhạc việt nam",
    "vietnamese karaoke",
    "sing along",
    "lời bài hát",
    trackTitle,
    artist,
    event.title,
    "karaoke vietnam",
    "hát online",
    "lyrics display",
  ].filter(Boolean);

  return {
    title,
    description,
    keywords: keywords.join(", "),
    openGraph: {
      title,
      description,
      type: "music.song",
      url: canonicalUrl,
      siteName: "ĐàLạt.app",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `Karaoke ${trackTitle} - ${artist}`,
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
        vi: `https://dalat.app/vi/events/${slug}/karaoke/${trackId}`,
        en: `https://dalat.app/en/events/${slug}/karaoke/${trackId}`,
      },
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function KaraokePage({ params }: PageProps) {
  const { slug, locale, trackId: rawTrackId } = await params;

  // Extract UUID from trackId — messaging apps sometimes append share text
  // to the URL (e.g. "a7888267-...d9 🎤 Sing along to..."), so we strip it
  const uuidMatch = rawTrackId.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  const trackId = uuidMatch ? uuidMatch[1] : rawTrackId;

  const data = await getKaraokeTrack(slug, trackId);

  if (!data) {
    notFound();
  }

  const { track, event, trackIndex } = data;

  // Attach user-locale lyric translations for the karaoke dual-line display
  const lyricsTranslations = await getLyricsTranslationsMap(
    data.playlist.tracks.map((tr) => tr.id),
    locale
  );
  const playlist = {
    ...data.playlist,
    tracks: data.playlist.tracks.map((tr) => ({
      ...tr,
      lyrics_translated: lyricsTranslations[tr.id] ?? null,
    })),
  };

  // Generate structured data for SEO
  const musicSchema = generateMusicRecordingSchema(track, event, locale);

  return (
    <>
      <JsonLd data={musicSchema} />
      <KaraokePageClient
        track={track}
        event={event}
        playlist={playlist}
        trackIndex={trackIndex}
        locale={locale}
      />
    </>
  );
}
