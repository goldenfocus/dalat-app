import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { JsonLd, generateMusicRecordingSchema } from "@/lib/structured-data";
import { Music, Download, Mic2, Clock, User, Disc, ArrowLeft } from "lucide-react";
import { formatDuration } from "@/lib/audio-metadata";
import { DownloadButton } from "./download-button";
import { getMixedKeywords } from "@/lib/seo/dalat-keywords";

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
}

interface TrackData {
  track: {
    id: string;
    title: string | null;
    artist: string | null;
    file_url: string;
    thumbnail_url: string | null;
    duration_seconds: number | null;
  };
  event: {
    id: string;
    slug: string;
    title: string;
    image_url: string | null;
  };
}

async function getDownloadTrack(eventSlug: string, trackId: string, staticClient?: ReturnType<typeof createStaticClient>): Promise<TrackData | null> {
  const supabase = staticClient ?? await createClient();

  const { data, error } = await supabase.rpc("get_event_playlist", {
    p_event_slug: eventSlug,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const firstRow = data[0] as PlaylistRpcRow;
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
    },
    event: {
      id: firstRow.event_id,
      slug: eventSlug,
      title: firstRow.event_title,
      image_url: firstRow.event_image_url,
    },
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale, trackId } = await params;
  const supabase = createStaticClient();
  if (!supabase) return { title: "Track" };
  const data = await getDownloadTrack(slug, trackId, supabase);

  if (!data) {
    return { title: "Track not found" };
  }

  const { track, event } = data;
  const trackTitle = track.title || "Track";
  const artist = track.artist || event.title;

  // SEO-optimized for download queries
  const title = locale === "vi"
    ? `Tải ${trackTitle} - ${artist} | MP3 Download | ĐàLạt.app`
    : `Download ${trackTitle} - ${artist} | MP3 | ĐàLạt.app`;

  const description = locale === "vi"
    ? `Tải nhạc "${trackTitle}" của ${artist} miễn phí. MP3 chất lượng cao từ sự kiện "${event.title}" tại Đà Lạt.`
    : `Download "${trackTitle}" by ${artist} for free. High quality MP3 from "${event.title}" event in Da Lat, Vietnam.`;

  const canonicalUrl = `https://dalat.app/${locale}/events/${slug}/download/${trackId}`;
  const ogImageUrl = track.thumbnail_url || event.image_url || `https://dalat.app/${locale}/events/${slug}/playlist/opengraph-image`;

  // Download-focused keywords with Dalat SEO boost
  const keywords = [
    `download ${trackTitle}`,
    `${trackTitle} mp3`,
    `${trackTitle} ${artist} download`,
    `tải nhạc ${trackTitle}`,
    `${trackTitle} free download`,
    artist,
    event.title,
    ...getMixedKeywords(4), // Random Dalat vibes
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
          alt: `Download ${trackTitle} - ${artist}`,
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
        vi: `https://dalat.app/vi/events/${slug}/download/${trackId}`,
        en: `https://dalat.app/en/events/${slug}/download/${trackId}`,
      },
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function DownloadPage({ params }: PageProps) {
  const { slug, locale, trackId } = await params;

  const data = await getDownloadTrack(slug, trackId);

  if (!data) {
    notFound();
  }

  const { track, event } = data;
  const trackTitle = track.title || "Untitled";
  const artist = track.artist || "Unknown Artist";

  // Generate structured data
  const musicSchema = {
    ...generateMusicRecordingSchema(
      { ...track, lyrics_lrc: null },
      event,
      locale
    ),
    // Add download action for rich results
    potentialAction: {
      "@type": "DownloadAction",
      target: track.file_url,
    },
  };

  return (
    <>
      <JsonLd data={musicSchema} />

      <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          {/* Back link */}
          <Link
            href={`/${locale}/events/${slug}/playlist`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 -ml-1 px-2 py-1 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{locale === "vi" ? "Quay lại playlist" : "Back to playlist"}</span>
          </Link>

          {/* Track card */}
          <div className="bg-card rounded-2xl border shadow-lg overflow-hidden">
            {/* Album art */}
            {(track.thumbnail_url || event.image_url) && (
              <div className="aspect-square max-h-80 w-full bg-muted">
                <img
                  src={track.thumbnail_url || event.image_url || ""}
                  alt={`${trackTitle} - ${artist}`}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="p-6">
              {/* Track info */}
              <h1 className="text-2xl md:text-3xl font-bold mb-2">{trackTitle}</h1>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-6">
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

              {/* Download button */}
              <DownloadButton
                fileUrl={track.file_url}
                filename={`${trackTitle} - ${artist}.mp3`}
                locale={locale}
              />

              {/* Alternative actions */}
              <div className="mt-6 pt-6 border-t flex flex-col sm:flex-row gap-3">
                <Link
                  href={`/${locale}/events/${slug}/karaoke/${trackId}`}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors"
                >
                  <Mic2 className="w-5 h-5" />
                  <span>{locale === "vi" ? "Hát Karaoke" : "Sing Karaoke"}</span>
                </Link>
                <Link
                  href={`/${locale}/events/${slug}/lyrics/${trackId}`}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors"
                >
                  <Music className="w-5 h-5" />
                  <span>{locale === "vi" ? "Xem Lời Bài Hát" : "View Lyrics"}</span>
                </Link>
              </div>
            </div>
          </div>

          {/* SEO content */}
          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>
              {locale === "vi"
                ? `Tải nhạc "${trackTitle}" của ${artist} từ sự kiện "${event.title}" tại Đà Lạt. Miễn phí, chất lượng cao.`
                : `Download "${trackTitle}" by ${artist} from "${event.title}" event in Da Lat, Vietnam. Free, high quality.`}
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
