import { notFound, redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MomentsViewContainer } from "@/components/moments/moments-view-container";
import { MusicPlayButton } from "@/components/audio/music-play-button";
import { JsonLd, generateCinemaAlbumSchema } from "@/lib/structured-data";
import { TribeChip, type ChipTribe } from "@/components/tribes/tribe-chip";
import { buildAlternates, localeUrl } from "@/lib/metadata";
import { buildSocialCardImageUrl } from "@/lib/events/share-preview";
import type { Locale } from "@/lib/i18n/routing";
import type { Event, MomentContentType, MomentWithProfile, EventSettings } from "@/lib/types";
import type { AudioTrack, PlaylistInfo } from "@/lib/stores/audio-player-store";

const INITIAL_PAGE_SIZE = 20;
const VIDEO_PENDING_STATUSES = ["uploading", "processing", "error"] as const;

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<{ view?: string }>;
}

type MomentQueryRow = MomentWithProfile & { captured_at: string | null };
type ProfileQueryRow = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};
type PendingMomentQueryRow = {
  id: string;
  event_id: string;
  user_id: string;
  content_type: MomentContentType;
  media_url: string | null;
  thumbnail_url: string | null;
  cf_video_uid: string | null;
  cf_playback_url: string | null;
  video_status: string | null;
  video_duration_seconds: number | null;
  text_content: string | null;
  created_at: string;
  captured_at: string | null;
  youtube_url: string | null;
  youtube_video_id: string | null;
  file_url: string | null;
  original_filename: string | null;
  file_size: number | null;
  mime_type: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  audio_duration_seconds: number | null;
  audio_thumbnail_url: string | null;
  track_number: string | null;
  release_year: number | null;
  genre: string | null;
  profiles: ProfileQueryRow | ProfileQueryRow[];
};

function getTimelineStamp(moment: { captured_at: string | null; created_at: string }): number {
  return new Date(moment.captured_at || moment.created_at).getTime();
}

function pickProfile(profiles: ProfileQueryRow | ProfileQueryRow[]): ProfileQueryRow {
  return Array.isArray(profiles) ? profiles[0] ?? { username: null, display_name: null, avatar_url: null } : profiles;
}

function normalizeMomentWithProfile<
  T extends {
    profiles: ProfileQueryRow | ProfileQueryRow[];
  }
>(
  moment: T
): MomentQueryRow {
  const profile = pickProfile(moment.profiles);
  return {
    ...(moment as unknown as MomentQueryRow),
    username: (moment as { username?: string | null }).username ?? profile.username,
    display_name: (moment as { display_name?: string | null }).display_name ?? profile.display_name,
    avatar_url: (moment as { avatar_url?: string | null }).avatar_url ?? profile.avatar_url,
  };
}

async function getMomentsWithPendingVideos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string
): Promise<{ moments: MomentWithProfile[]; hasMore: boolean; totalCount: number }> {
  const pageLimit = INITIAL_PAGE_SIZE;
  const [readyResult, pendingResult, countResult] = await Promise.all([
    supabase.rpc("get_event_moments", {
      p_event_id: eventId,
      p_limit: pageLimit,
      p_offset: 0,
    }),
    supabase
      .from("moments")
      .select(`
        id,
        event_id,
        user_id,
        content_type,
        media_url,
        thumbnail_url,
        cf_video_uid,
        cf_playback_url,
        video_status,
        video_duration_seconds,
        text_content,
        created_at,
        captured_at,
        youtube_url,
        youtube_video_id,
        file_url,
        original_filename,
        file_size,
        mime_type,
        title,
        artist,
        album,
        audio_duration_seconds,
        audio_thumbnail_url,
        track_number,
        release_year,
        genre,
        profiles!inner (
          username,
          display_name,
          avatar_url
        )
      `)
      .eq("event_id", eventId)
      .eq("status", "published")
      .eq("content_type", "video")
      .in("video_status", VIDEO_PENDING_STATUSES)
      .order("captured_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(pageLimit),
    supabase
      .from("moments")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "published"),
  ]);

  const readyMoments = (readyResult.data ?? []) as MomentQueryRow[];
  const pendingMoments = (pendingResult.data ?? []) as PendingMomentQueryRow[];

  const mergedMap = new Map<string, MomentQueryRow>();
  for (const moment of readyMoments) {
    mergedMap.set(moment.id, moment);
  }
  for (const moment of pendingMoments) {
    mergedMap.set(moment.id, normalizeMomentWithProfile(moment));
  }

  const moments = Array.from(mergedMap.values()).sort((a, b) => {
    const stampA = getTimelineStamp(a);
    const stampB = getTimelineStamp(b);
    if (stampA === stampB) return a.id.localeCompare(b.id);
    return stampA - stampB;
  });

  const totalCount = countResult.count ?? moments.length;
  const hasMore = totalCount > moments.length;

  return { moments: moments.slice(0, pageLimit), hasMore, totalCount };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const supabase = createStaticClient();
  if (!supabase) return { title: "Moments" };

  const { data: eventBySlug } = await supabase
    .from("events")
    .select("id, slug, title, location_name, starts_at, updated_at")
    .eq("slug", slug)
    .single();

  let event = eventBySlug;

  if (!event) {
    const { data: redirectEvent } = await supabase
      .from("events")
      .select("slug")
      .contains("previous_slugs", [slug])
      .single();

    if (redirectEvent?.slug) {
      const { data: canonicalEvent } = await supabase
        .from("events")
        .select("id, slug, title, location_name, starts_at, updated_at")
        .eq("slug", redirectEvent.slug)
        .single();

      event = canonicalEvent ?? null;
    }
  }

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
  const canonicalUrl = localeUrl(locale as Locale, `/events/${event.slug}/moments`);
  const previewVersion = `${momentCount}-${Date.parse(event.updated_at) || 0}`;
  const previewSourceUrl = `${canonicalUrl}/og-image?v=${previewVersion}`;
  const previewImageUrl = buildSocialCardImageUrl(previewSourceUrl);

  return {
    title,
    description,
    // Without this, the page inherits the locale layout's homepage canonical
    alternates: buildAlternates(locale as Locale, `/events/${event.slug}/moments`),
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalUrl,
      siteName: "ĐàLạt.app",
      images: [{
        url: previewImageUrl,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: event.title,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [previewImageUrl],
    },
  };
}

type EventWithTribe = Event & { tribes: ChipTribe | null };

type GetEventResult =
  | { type: "found"; event: EventWithTribe }
  | { type: "redirect"; newSlug: string }
  | { type: "not_found" };

async function getEvent(slug: string): Promise<GetEventResult> {
  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("*, tribes(slug, name, cover_image_url, access_type, settings)")
    .eq("slug", slug)
    .single();

  if (!error && event) {
    return { type: "found", event: event as EventWithTribe };
  }

  const { data: redirectEvent } = await supabase
    .from("events")
    .select("slug")
    .contains("previous_slugs", [slug])
    .single();

  if (redirectEvent?.slug) {
    return { type: "redirect", newSlug: redirectEvent.slug };
  }

  return { type: "not_found" };
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
  return getMomentsWithPendingVideos(supabase, eventId);
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
  const result = await getEvent(slug);

  if (result.type === "not_found") {
    notFound();
  }

  if (result.type === "redirect") {
    const queryString = view ? `?view=${encodeURIComponent(view)}` : "";
    redirect(`/${locale}/events/${result.newSlug}/moments${queryString}`);
  }

  const event = result.event;

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
              <Link href={`/events/${event.slug}/moments/new`} className="ml-auto">
                <Button size="sm" variant="outline" className="active:scale-95 transition-transform">
                  <Plus className="w-4 h-4 mr-1" />
                  {t("addMoment")}
                </Button>
              </Link>
            )}
          </div>
          <Link
            href={`/events/${event.slug}`}
            className="text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            {event.title} &rarr;
          </Link>
          {/* Moments inherit their tribe from the event — no moments.tribe_id */}
          {event.tribes && (
            <div className="mt-3">
              <TribeChip tribe={event.tribes} />
            </div>
          )}
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
          eventCreatedBy={event.created_by}
        />

        {/* CTA for users who can post but haven't yet */}
        {moments.length === 0 && canPost && (
          <div className="mt-6 text-center">
            <Link href={`/events/${event.slug}/moments/new`}>
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
