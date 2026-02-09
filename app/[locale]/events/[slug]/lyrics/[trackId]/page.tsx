import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import {
  JsonLd,
  generateMusicRecordingSchema,
  generateLyricsFAQSchema,
  generateSpeakableSchema,
} from "@/lib/structured-data";
import { Music, Mic2, ExternalLink, Clock, User, Disc, Globe } from "lucide-react";
import { formatDuration } from "@/lib/audio-metadata";
import { getTrackLyricsTranslation } from "@/lib/translations";
import type { ContentLocale } from "@/lib/types";
import { LOCALE_FLAGS, LOCALE_NAMES } from "@/lib/types";
import { getTrackSeoKeywords } from "@/lib/seo/dalat-keywords";

interface PageProps {
  params: Promise<{ slug: string; locale: string; trackId: string }>;
}

// RPC return type for get_event_playlist
interface PlaylistRpcRow {
  event_id: string;
  event_title: string;
  event_image_url: string | null;
  track_id: string | null;
  track_title: string | null;
  track_artist: string | null;
  track_file_url: string | null;
  track_thumbnail_url: string | null;
  track_duration_seconds: number | null;
  track_lyrics_lrc: string | null;
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
}

async function getLyricsTrack(eventSlug: string, trackId: string, staticClient?: ReturnType<typeof createStaticClient>): Promise<TrackData | null> {
  const supabase = staticClient ?? await createClient();

  // Get event playlist with track
  const { data, error } = await supabase.rpc("get_event_playlist", {
    p_event_slug: eventSlug,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const firstRow = data[0];

  // Find the requested track
  const trackRow = (data as PlaylistRpcRow[]).find((row) => row.track_id === trackId);
  if (!trackRow) {
    return null;
  }

  return {
    track: {
      id: trackRow.track_id!,
      title: trackRow.track_title,
      artist: trackRow.track_artist,
      file_url: trackRow.track_file_url!,
      thumbnail_url: trackRow.track_thumbnail_url,
      duration_seconds: trackRow.track_duration_seconds,
      lyrics_lrc: trackRow.track_lyrics_lrc,
    },
    event: {
      id: firstRow.event_id,
      slug: eventSlug,
      title: firstRow.event_title,
      image_url: firstRow.event_image_url,
    },
  };
}

/**
 * Parse LRC lyrics to plain text lines for display
 */
function parseLrcToLines(lrc: string): string[] {
  return lrc
    .split("\n")
    .map((line) => {
      // Remove timestamp [mm:ss.xx]
      const text = line.replace(/^\[\d{1,2}:\d{2}[.:]\d{2,3}\]/, "").trim();
      // Skip metadata lines [la:vi] [ar:artist] etc
      if (text.startsWith("[") || !text) return null;
      return text;
    })
    .filter((line): line is string => line !== null);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale, trackId } = await params;
  const supabase = createStaticClient();
  if (!supabase) return { title: "Lyrics" };
  const data = await getLyricsTrack(slug, trackId, supabase);

  if (!data) {
    return { title: "Lyrics not found" };
  }

  const { track, event } = data;
  const trackTitle = track.title || "Bai hat";
  const artist = track.artist || event.title;

  // Extract plain text preview for description
  const lyricsPreview = track.lyrics_lrc
    ? parseLrcToLines(track.lyrics_lrc).slice(0, 4).join(" / ")
    : "";

  // SEO-optimized title
  const title = locale === "vi"
    ? `${trackTitle} - ${artist} | Loi Bai Hat | Dalat.app`
    : `${trackTitle} - ${artist} | Lyrics | Dalat.app`;

  const description = locale === "vi"
    ? `Loi bai hat "${trackTitle}" cua ${artist}. ${lyricsPreview}... Hat karaoke online tai Dalat.app`
    : `Lyrics for "${trackTitle}" by ${artist}. ${lyricsPreview}... Sing karaoke online at Dalat.app`;

  const canonicalUrl = `https://dalat.app/${locale}/events/${slug}/lyrics/${trackId}`;
  const ogImageUrl = track.thumbnail_url || event.image_url || `https://dalat.app/${locale}/events/${slug}/playlist/opengraph-image`;

  // Rich keywords for lyrics search with Dalat SEO boost
  const keywords = [
    ...getTrackSeoKeywords(trackTitle, artist, locale),
    `loi bai hat ${trackTitle}`,
    `lyrics ${trackTitle}`,
    `${trackTitle} ${artist}`,
    event.title,
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
      siteName: "DaLat.app",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${trackTitle} - ${artist} Lyrics`,
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
      // All 12 languages for maximum SEO coverage
      languages: {
        en: `https://dalat.app/en/events/${slug}/lyrics/${trackId}`,
        vi: `https://dalat.app/vi/events/${slug}/lyrics/${trackId}`,
        ko: `https://dalat.app/ko/events/${slug}/lyrics/${trackId}`,
        zh: `https://dalat.app/zh/events/${slug}/lyrics/${trackId}`,
        ru: `https://dalat.app/ru/events/${slug}/lyrics/${trackId}`,
        fr: `https://dalat.app/fr/events/${slug}/lyrics/${trackId}`,
        ja: `https://dalat.app/ja/events/${slug}/lyrics/${trackId}`,
        ms: `https://dalat.app/ms/events/${slug}/lyrics/${trackId}`,
        th: `https://dalat.app/th/events/${slug}/lyrics/${trackId}`,
        de: `https://dalat.app/de/events/${slug}/lyrics/${trackId}`,
        es: `https://dalat.app/es/events/${slug}/lyrics/${trackId}`,
        id: `https://dalat.app/id/events/${slug}/lyrics/${trackId}`,
      },
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function LyricsPage({ params }: PageProps) {
  const { slug, locale, trackId } = await params;

  const data = await getLyricsTrack(slug, trackId);

  if (!data) {
    notFound();
  }

  const { track, event } = data;
  const trackTitle = track.title || "Untitled";
  const artist = track.artist || "Unknown Artist";

  // Get translated lyrics
  const { lyrics: translatedLyrics, is_translated } = await getTrackLyricsTranslation(
    trackId,
    locale as ContentLocale,
    track.lyrics_lrc,
    'vi' // Default source locale for Vietnamese content
  );

  // Parse lyrics for display (use translated if available, otherwise original)
  const lyricsLines = translatedLyrics
    ? parseLrcToLines(translatedLyrics)
    : [];

  // Full lyrics text for FAQ schema
  const lyricsText = lyricsLines.join(" ");

  // Generate structured data for SEO/AEO
  const musicSchema = generateMusicRecordingSchema(track, event, locale);
  const faqSchema = generateLyricsFAQSchema(track, event, lyricsText, locale);
  const pageUrl = `https://dalat.app/${locale}/events/${slug}/lyrics/${trackId}`;
  const speakableSchema = generateSpeakableSchema(pageUrl, [
    "h1",           // Song title
    "article h2",   // "Lyrics" heading
    "article p",    // Lyrics lines - speakable by voice assistants
  ]);

  return (
    <>
      <JsonLd data={[musicSchema, faqSchema, speakableSchema]} />

      <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          {/* Back link */}
          <Link
            href={`/${locale}/events/${slug}/playlist`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 -ml-1 px-2 py-1 rounded-lg transition-colors"
          >
            <Music className="w-4 h-4" />
            <span>{locale === "vi" ? "Quay lai playlist" : "Back to playlist"}</span>
          </Link>

          {/* Track header */}
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{trackTitle}</h1>
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                {artist}
              </span>
              {track.duration_seconds && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {formatDuration(track.duration_seconds)}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Disc className="w-4 h-4" />
                {event.title}
              </span>
            </div>
          </header>

          {/* CTA to karaoke */}
          <Link
            href={`/${locale}/events/${slug}/karaoke/${trackId}`}
            className="flex items-center justify-center gap-2 w-full py-4 px-6 mb-8 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors"
          >
            <Mic2 className="w-5 h-5" />
            <span>{locale === "vi" ? "Hat Karaoke Ngay" : "Sing Karaoke Now"}</span>
            <ExternalLink className="w-4 h-4 ml-1" />
          </Link>

          {/* Lyrics content - full text for SEO */}
          <article className="prose prose-lg dark:prose-invert max-w-none">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Music className="w-5 h-5" />
              {locale === "vi" ? "Lời Bài Hát" : "Lyrics"}
              {is_translated && (
                <span className="inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                  <Globe className="w-3 h-3" />
                  {LOCALE_FLAGS[locale as ContentLocale]} {LOCALE_NAMES[locale as ContentLocale]}
                </span>
              )}
            </h2>

            {lyricsLines.length > 0 ? (
              <div className="bg-card rounded-xl p-6 border shadow-sm">
                <div className="space-y-3 text-lg leading-relaxed">
                  {lyricsLines.map((line, index) => (
                    <p key={index} className="m-0">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{locale === "vi" ? "Khong co loi bai hat" : "No lyrics available"}</p>
              </div>
            )}
          </article>

          {/* Bottom CTA */}
          <div className="mt-8 text-center">
            <Link
              href={`/${locale}/events/${slug}/karaoke/${trackId}`}
              className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
            >
              <Mic2 className="w-4 h-4" />
              {locale === "vi" ? "Hat karaoke voi nhac" : "Sing along with karaoke"}
            </Link>
          </div>

          {/* SEO footer with event info */}
          <footer className="mt-12 pt-8 border-t text-sm text-muted-foreground">
            <p>
              {locale === "vi"
                ? `Loi bai hat "${trackTitle}" tu su kien "${event.title}" tren DaLat.app. Hat karaoke online voi loi hien thi theo nhac.`
                : `Lyrics for "${trackTitle}" from "${event.title}" on DaLat.app. Sing karaoke online with synchronized lyrics.`}
            </p>
          </footer>
        </div>
      </main>
    </>
  );
}
