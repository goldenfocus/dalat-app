import { OriginalText } from "@/components/ui/original-text";
import { translatedRecords } from "@/lib/translations/public-content";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Calendar, MapPin, Plus } from "lucide-react";
import { withVenueCredits } from "@/lib/moments/venue-credit";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDistanceToNow } from "date-fns";
import {
  vi, ko, zhCN, ru, fr, ja, ms, th, de, es, id as idLocale, enUS
} from "date-fns/locale";
import { getTranslations } from "next-intl/server";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatInDaLatAsync } from "@/lib/timezone";
import { generateMomentMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateMomentSchema } from "@/lib/structured-data";
import { DeleteMomentButton } from "@/components/moments/delete-moment-button";
import { SetCoverButton } from "@/components/moments/set-cover-button";
import { MomentDetailHeader } from "@/components/moments/moment-detail-header";
import { MomentCaptionEditor } from "@/components/moments/moment-caption-editor";
import { CommentsSection } from "@/components/comments";
import { ReactionBar } from "@/components/reactions/reaction-bar";
import { TranslatedFrom } from "@/components/ui/translation-badge";
import { ExpandableMomentImage } from "@/components/moments/expandable-moment-image";
import { MomentImagePreloader } from "@/components/moments/moment-image-preloader";
import { MomentVideoPlayer } from "@/components/moments/moment-video-player";
import { MomentAiInsights } from "@/components/moments/moment-ai-insights";
import { getCfStreamPlaybackUrl } from "@/lib/media-utils";
import { getTranslationsWithFallback, isValidContentLocale, getEventTranslationsBatch } from "@/lib/translations";
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

  const [credited] = await withVenueCredits(supabase, [data]);
  if (credited.credit_venue_id) {
    credited.profiles = { ...data.profiles, display_name: credited.display_name, avatar_url: credited.avatar_url };
  }
  return credited as MomentWithDetails;
}

interface AdjacentMoments {
  prevId: string | null;
  nextId: string | null;
  prevMediaUrl: string | null;
  nextMediaUrl: string | null;
}

// Shape returned by the get_adjacent_moments RPC (see migration 20261012).
interface AdjacentMomentRow {
  prev_id: string | null;
  prev_media_url: string | null;
  next_id: string | null;
  next_media_url: string | null;
}

async function getAdjacentMoments(
  momentId: string,
  eventId: string
): Promise<AdjacentMoments> {
  const supabase = await createClient();

  // Navigation must use the SAME sort key the gallery grid uses —
  // COALESCE(captured_at, created_at) — or prev/next jumps to unrelated photos
  // once real EXIF capture times land. That key can't be expressed as a
  // PostgREST .lt()/.gt() cursor, so it lives in an RPC (LAG/LEAD over the same
  // ORDER BY as get_event_moments), which also handles the wrap-around.
  const { data } = await supabase.rpc("get_adjacent_moments", {
    p_moment_id: momentId,
    p_event_id: eventId,
  });

  // Array form rather than .single(): a moment whose siblings are all filtered
  // out by RLS legitimately returns zero rows, and .single() would turn that
  // into an error instead of "no neighbours".
  const row = ((data ?? []) as AdjacentMomentRow[])[0];

  return {
    prevId: row?.prev_id ?? null,
    nextId: row?.next_id ?? null,
    prevMediaUrl: row?.prev_media_url ?? null,
    nextMediaUrl: row?.next_media_url ?? null,
  };
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
  const [t, tCommon, titles, translated] = await Promise.all([
    getTranslations({ locale, namespace: "moments" }),
    getTranslations({ locale, namespace: "common" }),
    getEventTranslationsBatch([moment.events.id], locale as Locale),
    translatedRecords("moment", [moment.id], locale),
  ]);
  const eventTitle = titles.get(moment.events.id)?.title || moment.events.title;
  const [credited] = await withVenueCredits(supabase, [moment]);
  const name = credited.credit_venue_id ? credited.display_name : moment.profiles.display_name || moment.profiles.username || tCommon("anonymous");
  const fields = translated.get(moment.id);
  return generateMomentMetadata(
    {
      ...moment,
      profiles: { ...moment.profiles, display_name: name },
      text_content: fields?.get("text_content") || moment.text_content,
      events: { ...moment.events, title: eventTitle },
      ai_description: fields?.get("ai_description") || meta?.ai_description,
      ai_tags: meta?.ai_tags,
      detected_objects: meta?.detected_objects,
      mood: meta?.mood,
    } as MomentWithDetails & {
      ai_description?: string | null;
      ai_tags?: string[] | null;
      detected_objects?: string[] | null;
      mood?: string | null;
    },
    locale as Locale,
    {
      title: t("momentTitle", { name, event: eventTitle }),
      fallbackDescription: t("momentDescription", { name, event: eventTitle }),
    }
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
    moment.event_id
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
  const eventTitles = await getEventTranslationsBatch([event.id], locale as Locale);
  const eventTitle = eventTitles.get(event.id)?.title || event.title;
  const eventDate = await formatInDaLatAsync(event.starts_at, "PPP", locale as Locale);
  const profile = moment.profiles;

  // Fetch translations for text content
  const translationResult = await getTranslationsWithFallback(
    "moment",
    moment.id,
    locale as ContentLocale,
    { text_content: moment.text_content, ai_description: moment.moment_metadata?.ai_description || null }
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
    { name: "ĐàLạt.app", url: "https://dalat.app" },
    { name: eventTitle, url: `https://dalat.app/events/${event.slug}` },
    { name: t("moments"), url: `https://dalat.app/events/${event.slug}/moments` },
  ], locale);

  const momentSchema = generateMomentSchema(
    { ...moment, text_content: translatedText, profiles: { ...profile, display_name: profile.display_name || profile.username || tCommon("anonymous") }, events: { ...event, title: eventTitle } },
    locale,
    t("momentTitle", { name: profile.display_name || profile.username || tCommon("anonymous"), event: eventTitle }),
  );

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
          eventTitle={eventTitle}
          momentId={moment.id}
          from={from}
          mediaUrl={moment.media_url}
          contentType={moment.content_type}
          originalFilename={moment.original_filename}
          mimeType={moment.mime_type}
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
                          alt={t("videoProcessing")}
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
                      alt={translationResult.ai_description || translatedText || eventTitle}
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
                        aria-label={tCommon("previous")}
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </Link>
                    )}
                    {adjacentMoments.nextId && (
                      <Link
                        href={buildMomentUrl(adjacentMoments.nextId)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                        aria-label={tCommon("next")}
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
                  href={moment.credit_venue_slug ? `/venues/${moment.credit_venue_slug}` : `/${profile.username || moment.user_id}`}
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
              {translatedText && (
                <div className="space-y-2">
                  {moment.content_type !== "text" && <p className="text-lg whitespace-pre-wrap">{translatedText}</p>}
                  {isTranslated && (
                    <TranslatedFrom
                      sourceLocale={sourceLocale}
                      originalText={moment.text_content || undefined}
                      className="text-xs"
                    />
                  )}
                </div>
              )}

              {/* AI Insights — crawlable metadata for SEO/AEO */}
              {moment.moment_metadata && (
                <MomentAiInsights
                  momentId={moment.id}
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

              {/* Reactions */}
              <ReactionBar
                targetType="moment"
                targetId={moment.id}
                isAuthenticated={!!user?.id}
                variant="inline"
                returnTo={`/events/${event.slug}/moments/${moment.id}`}
              />

              {isOwner && <MomentCaptionEditor momentId={moment.id} initialCaption={moment.text_content} />}
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
                          alt={eventTitle}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          sizes="320px"
                        />
                      </div>
                    )}
                    <h3 className="font-semibold group-hover:underline line-clamp-2">
                      {eventTitle}
                    </h3>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{eventDate}</span>
                      </div>
                      {event.location_name && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span className="truncate">{event.location_name}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                  {eventTitle !== event.title && <OriginalText text={event.title} />}
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
