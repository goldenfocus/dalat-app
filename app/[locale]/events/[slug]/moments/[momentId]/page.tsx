import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Calendar, MapPin, Plus } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDistanceToNow } from "date-fns";
import {
  vi, ko, zhCN, ru, fr, ja, ms, th, de, es, id as idLocale, enUS
} from "date-fns/locale";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatInDaLat } from "@/lib/timezone";
import { generateMomentMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateMomentSchema } from "@/lib/structured-data";
import { DeleteMomentButton } from "@/components/moments/delete-moment-button";
import { SetCoverButton } from "@/components/moments/set-cover-button";
import { MomentDetailHeader } from "@/components/moments/moment-detail-header";
import { CommentsSection } from "@/components/comments";
import { TranslatedFrom } from "@/components/ui/translation-badge";
import { ExpandableMomentImage } from "@/components/moments/expandable-moment-image";
import { MomentImagePreloader } from "@/components/moments/moment-image-preloader";
import { MomentVideoPlayer } from "@/components/moments/moment-video-player";
import { MomentAiInsights } from "@/components/moments/moment-ai-insights";
import { getCfStreamPlaybackUrl } from "@/lib/media-utils";
import { getTranslationsWithFallback, isValidContentLocale } from "@/lib/translations";
import { decodeUnicodeEscapes } from "@/lib/utils";
import { hasRoleLevel, type Moment, type Event, type Profile, type MomentMetadata, type ContentLocale, type Locale, type UserRole } from "@/lib/types";
import {
  YouTubeEmbed,
  AudioPlayer,
  PDFPreview,
  ImagePreview,
  DocumentLink,
} from "@/components/shared/material-renderers";

// Map our locales to date-fns locales for relative time formatting
const dateFnsLocales: Record<Locale, typeof enUS> = {
  en: enUS,
  vi: vi,
  ko: ko,
  zh: zhCN,
  ru: ru,
  fr: fr,
  ja: ja,
  ms: ms,
  th: th,
  de: de,
  es: es,
  id: idLocale,
};

interface PageProps {
  params: Promise<{ slug: string; momentId: string; locale: string }>;
  searchParams: Promise<{ from?: string }>;
}

type MomentWithDetails = Moment & {
  profiles: Profile;
  events: Event;
  moment_metadata: MomentMetadata | null;
};

async function getMoment(id: string, expectedSlug?: string): Promise<MomentWithDetails | null> {
  const supabase = await createClient();

  // Use explicit FK hint to disambiguate from events.cover_moment_id relationship
  // Join moment_metadata for AI-generated descriptions, tags, and insights
  const { data, error } = await supabase
    .from("moments")
    .select("*, profiles(*), events!moments_event_id_fkey(*), moment_metadata(*)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !data) return null;

  const event = data.events;
  const profile = data.profiles;

  if (!profile || !event) return null;

  // Validate event has required fields
  if (!event.slug || !event.title || !event.starts_at || !event.created_by) {
    return null;
  }

  // If expected slug provided, verify it matches
  if (expectedSlug && event.slug !== expectedSlug) {
    return null; // Will trigger redirect or 404
  }

  return data as MomentWithDetails;
}

interface AdjacentMoments {
  prevId: string | null;
  nextId: string | null;
  prevMediaUrl: string | null;
  nextMediaUrl: string | null;
}

async function getAdjacentMoments(
  momentId: string,
  eventId: string,
  createdAt: string
): Promise<AdjacentMoments> {
  const supabase = await createClient();

  // Get previous moment (older) in same event - with media_url for preloading
  const { data: prevInEvent } = await supabase
    .from("moments")
    .select("id, media_url")
    .eq("event_id", eventId)
    .eq("status", "published")
    .lt("created_at", createdAt)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Get next moment (newer) in same event - with media_url for preloading
  const { data: nextInEvent } = await supabase
    .from("moments")
    .select("id, media_url")
    .eq("event_id", eventId)
    .eq("status", "published")
    .gt("created_at", createdAt)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  // Wrap around if at boundary - get last/first in event
  let prevId = prevInEvent?.id ?? null;
  let nextId = nextInEvent?.id ?? null;
  let prevMediaUrl = prevInEvent?.media_url ?? null;
  let nextMediaUrl = nextInEvent?.media_url ?? null;

  if (!prevId) {
    const { data: lastMoment } = await supabase
      .from("moments")
      .select("id, media_url")
      .eq("event_id", eventId)
      .eq("status", "published")
      .neq("id", momentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    prevId = lastMoment?.id ?? null;
    prevMediaUrl = lastMoment?.media_url ?? null;
  }

  if (!nextId) {
    const { data: firstMoment } = await supabase
      .from("moments")
      .select("id, media_url")
      .eq("event_id", eventId)
      .eq("status", "published")
      .neq("id", momentId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    nextId = firstMoment?.id ?? null;
    nextMediaUrl = firstMoment?.media_url ?? null;
  }

  return { prevId, nextId, prevMediaUrl, nextMediaUrl };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { momentId, locale } = await params;
  // Use static client for metadata (no cookies) so OG tags appear in initial <head>
  const supabase = createStaticClient();
  if (!supabase) return { title: "Moment Not Found" };

  const { data: moment } = await supabase
    .from("moments")
    .select("*, profiles(*), events!moments_event_id_fkey(*), moment_metadata(*)")
    .eq("id", momentId)
    .eq("status", "published")
    .single();

  if (!moment?.profiles || !moment?.events) {
    return { title: "Moment Not Found" };
  }

  const meta = moment.moment_metadata;
  return generateMomentMetadata(
    {
      ...moment,
      ai_description: meta?.ai_description,
      ai_tags: meta?.ai_tags,
      detected_objects: meta?.detected_objects,
      mood: meta?.mood,
    } as MomentWithDetails & {
      ai_description?: string | null;
      ai_tags?: string[] | null;
      detected_objects?: string[] | null;
      mood?: string | null;
    },
    locale as Locale
  );
}

export default async function MomentDetailPage({ params, searchParams }: PageProps) {
  const { slug, momentId, locale } = await params;
  const { from } = await searchParams;

  const supabase = await createClient();

  // First check if moment exists
  const moment = await getMoment(momentId);

  if (!moment) {
    notFound();
  }

  // If slug doesn't match, redirect to correct URL
  if (moment.events.slug !== slug) {
    redirect(`/${locale}/events/${moment.events.slug}/moments/${momentId}`);
  }

  // Get adjacent moments for navigation
  const adjacentMoments = await getAdjacentMoments(
    moment.id,
    moment.event_id,
    moment.created_at
  );

  // Get current user and check permissions
  const { data: { user } } = await supabase.auth.getUser();
  const isOwner = user?.id === moment.user_id;
  const isEventCreator = user?.id === moment.events.created_by;

  // Check if user is admin or moderator
  let isAdminOrMod = false;
  if (user) {
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdminOrMod = userProfile?.role ? hasRoleLevel(userProfile.role as UserRole, "moderator") : false;
  }

  const canModerate = isEventCreator || isAdminOrMod;

  const t = await getTranslations("moments");
  const tCommon = await getTranslations("common");

  const event = moment.events;
  const profile = moment.profiles;

  // Fetch translations for text content
  const translationResult = await getTranslationsWithFallback(
    "moment",
    moment.id,
    locale as ContentLocale,
    { text_content: moment.text_content }
  );

  const translatedText = translationResult.text_content
    ? decodeUnicodeEscapes(translationResult.text_content)
    : moment.text_content;
  const isTranslated = translatedText !== moment.text_content && !!translatedText;
  const sourceLocale = moment.source_locale && isValidContentLocale(moment.source_locale)
    ? (moment.source_locale as ContentLocale)
    : null;

  // Format relative time
  const dateFnsLocale = dateFnsLocales[locale as Locale] || enUS;
  const timeAgo = formatDistanceToNow(new Date(moment.created_at), {
    addSuffix: true,
    locale: dateFnsLocale,
  });

  // Build navigation URLs with clean paths
  const buildMomentUrl = (id: string) => `/events/${event.slug}/moments/${id}`;

  // Structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "Home", url: "https://dalat.app" },
    { name: event.title, url: `https://dalat.app/events/${event.slug}` },
    { name: t("moments"), url: `https://dalat.app/events/${event.slug}/moments` },
  ], locale);

  const momentSchema = generateMomentSchema(moment, locale);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={momentSchema} />

      {/* Preload adjacent images */}
      <MomentImagePreloader
        prevMediaUrl={adjacentMoments.prevMediaUrl}
        nextMediaUrl={adjacentMoments.nextMediaUrl}
      />

      <div className="min-h-screen bg-background">
        <MomentDetailHeader
          eventSlug={event.slug}
          eventTitle={event.title}
          momentId={moment.id}
          from={from}
        />
        <main className="container max-w-4xl mx-auto px-4 py-6">
          <div className="grid lg:grid-cols-[1fr,320px] gap-6">
            {/* Main content */}
            <div className="space-y-4">
              {/* Media display */}
              <div className="relative rounded-xl overflow-hidden bg-muted">
                {/* YouTube embed */}
                {moment.content_type === "youtube" && moment.youtube_video_id && (
                  <YouTubeEmbed videoId={moment.youtube_video_id} />
                )}

                {/* Audio player */}
                {moment.content_type === "audio" && moment.file_url && (
                  <AudioPlayer
                    url={moment.file_url}
                    title={moment.title || moment.original_filename || undefined}
                    artist={moment.artist || undefined}
                    thumbnailUrl={moment.audio_thumbnail_url || undefined}
                  />
                )}

                {/* PDF preview */}
                {moment.content_type === "pdf" && moment.file_url && (
                  <PDFPreview
                    url={moment.file_url}
                    filename={moment.original_filename || undefined}
                  />
                )}

                {/* Image material */}
                {moment.content_type === "image" && moment.file_url && (
                  <ImagePreview
                    url={moment.file_url}
                    title={moment.text_content || moment.title || "Image"}
                  />
                )}

                {/* Document link */}
                {moment.content_type === "document" && moment.file_url && (
                  <DocumentLink
                    url={moment.file_url}
                    filename={moment.original_filename || undefined}
                  />
                )}

                {/* Video player */}
                {moment.content_type === "video" && (
                  moment.video_status === "ready" || !moment.cf_video_uid ? (
                    <MomentVideoPlayer
                      src={moment.media_url || ""}
                      hlsSrc={moment.cf_playback_url || getCfStreamPlaybackUrl(moment.cf_video_uid) || undefined}
                      poster={moment.thumbnail_url || undefined}
                    />
                  ) : (
                    // Video is still processing - show placeholder with status
                    <div className="aspect-video flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-muted to-muted/80">
                      {moment.thumbnail_url ? (
                        <Image
                          src={moment.thumbnail_url}
                          alt="Video processing"
                          fill
                          className="object-cover opacity-50"
                        />
                      ) : null}
                      <div className="relative z-10 flex flex-col items-center gap-3 text-center px-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {moment.video_status === "uploading" ? t("videoUploading") : t("videoProcessing")}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {t("videoProcessingHint")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* Photo */}
                {moment.content_type === "photo" && moment.media_url && (
                  <div className="relative aspect-[4/3]">
                    <ExpandableMomentImage
                      src={moment.media_url}
                      alt={moment.moment_metadata?.ai_description || translatedText || "Photo from Đà Lạt"}
                    />
                  </div>
                )}

                {/* Text-only */}
                {moment.content_type === "text" && (
                  <div className="aspect-square flex items-center justify-center p-8 bg-gradient-to-br from-primary/20 to-primary/5">
                    <p className="text-xl text-center whitespace-pre-wrap">
                      {translatedText}
                    </p>
                  </div>
                )}

                {/* Navigation arrows */}
                {(adjacentMoments.prevId || adjacentMoments.nextId) && (
                  <>
                    {adjacentMoments.prevId && (
                      <Link
                        href={buildMomentUrl(adjacentMoments.prevId)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                        aria-label="Previous moment"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </Link>
                    )}
                    {adjacentMoments.nextId && (
                      <Link
                        href={buildMomentUrl(adjacentMoments.nextId)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                        aria-label="Next moment"
                      >
                        <ChevronRight className="w-6 h-6" />
                      </Link>
                    )}
                  </>
                )}
              </div>

              {/* Author and actions */}
              <div className="flex items-center justify-between">
                <Link
                  href={`/${profile.username || moment.user_id}`}
                  className="flex items-center gap-3 group"
                >
                  <UserAvatar
                    src={profile.avatar_url}
                    alt={profile.display_name || profile.username || ""}
                    size="md"
                  />
                  <div>
                    <p className="font-medium group-hover:underline">
                      {profile.display_name || profile.username || tCommon("anonymous")}
                    </p>
                    <p className="text-sm text-muted-foreground">{timeAgo}</p>
                  </div>
                </Link>
                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <SetCoverButton
                    momentId={moment.id}
                    isCover={(event as { cover_moment_id?: string }).cover_moment_id === moment.id}
                    canSetCover={isEventCreator || isAdminOrMod}
                  />
                  <DeleteMomentButton
                    momentId={moment.id}
                    eventSlug={event.slug}
                    isOwner={isOwner}
                    canModerate={canModerate}
                  />
                </div>
              </div>

              {/* Caption */}
              {translatedText && moment.content_type !== "text" && (
                <div className="space-y-2">
                  <p className="text-lg whitespace-pre-wrap">{translatedText}</p>
                  {isTranslated && sourceLocale && (
                    <TranslatedFrom
                      sourceLocale={sourceLocale}
                      className="text-xs"
                    />
                  )}
                </div>
              )}

              {/* AI Insights — crawlable metadata for SEO/AEO */}
              {moment.moment_metadata && (
                <MomentAiInsights
                  aiDescription={moment.moment_metadata.ai_description}
                  sceneDescription={moment.moment_metadata.scene_description}
                  aiTags={moment.moment_metadata.ai_tags}
                  detectedObjects={moment.moment_metadata.detected_objects}
                  detectedText={moment.moment_metadata.detected_text}
                  mood={moment.moment_metadata.mood}
                  dominantColors={moment.moment_metadata.dominant_colors}
                  locationHints={moment.moment_metadata.location_hints}
                  videoSummary={moment.moment_metadata.video_summary}
                  audioSummary={moment.moment_metadata.audio_summary}
                  pdfSummary={moment.moment_metadata.pdf_summary}
                  contentType={moment.content_type}
                />
              )}

              {/* Comments */}
              <Suspense fallback={<div className="h-32 animate-pulse bg-muted rounded-lg" />}>
                <CommentsSection
                  targetType="moment"
                  targetId={moment.id}
                  contentOwnerId={moment.user_id}
                  currentUserId={user?.id}
                  redirectPath={`/events/${event.slug}/moments/${moment.id}`}
                />
              </Suspense>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Event card */}
              <Card>
                <CardContent className="p-4">
                  <Link
                    href={`/events/${event.slug}`}
                    className="block group"
                  >
                    {event.image_url && (
                      <div className="relative aspect-video rounded-lg overflow-hidden mb-3">
                        <Image
                          src={event.image_url}
                          alt={event.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          sizes="320px"
                        />
                      </div>
                    )}
                    <h3 className="font-semibold group-hover:underline line-clamp-2">
                      {event.title}
                    </h3>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formatInDaLat(event.starts_at, "PPP")}</span>
                      </div>
                      {event.location_name && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span className="truncate">{event.location_name}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                </CardContent>
              </Card>

              {/* View all moments link */}
              <Link
                href={`/events/${event.slug}/moments`}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg border hover:bg-muted/50 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                {t("viewAll")}
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
