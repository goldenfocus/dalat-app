import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import Image from "next/image";
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar, MapPin, Plus } from "lucide-react";
import { AuthButton } from "@/components/auth-button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDistanceToNow } from "date-fns";
import {
  vi, ko, zhCN, ru, fr, ja, ms, th, de, es, id as idLocale, enUS
} from "date-fns/locale";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { isVideoUrl } from "@/lib/media-utils";
import { formatInDaLat } from "@/lib/timezone";
import { generateMomentMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateMomentSchema } from "@/lib/structured-data";
import { DeleteMomentButton } from "@/components/moments/delete-moment-button";
import { TranslatedFrom } from "@/components/ui/translation-badge";
import { ExpandableMomentImage } from "@/components/moments/expandable-moment-image";
import { MomentImagePreloader } from "@/components/moments/moment-image-preloader";
import { getTranslationsWithFallback, isValidContentLocale } from "@/lib/translations";
import { decodeUnicodeEscapes } from "@/lib/utils";
import { hasRoleLevel, type Moment, type Event, type Profile, type ContentLocale, type Locale, type UserRole } from "@/lib/types";

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
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

type MomentWithDetails = Moment & {
  profiles: Profile;
  events: Event;
};

async function getMoment(id: string): Promise<MomentWithDetails | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("moments")
    .select("*, profiles(*), events(*)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !data) return null;

  // Validate that required related data exists and has required fields
  // This handles: deleted events/profiles, corrupted data, RLS restrictions
  const event = data.events;
  const profile = data.profiles;

  if (!profile || !event) return null;

  // Ensure event has all required fields for rendering
  if (!event.slug || !event.title || !event.starts_at || !event.created_by) {
    console.error(`Moment ${id} has event with missing required fields:`, {
      slug: event.slug,
      title: event.title,
      starts_at: event.starts_at,
      created_by: event.created_by,
    });
    return null;
  }

  return data as MomentWithDetails;
}

interface AdjacentMoments {
  prevId: string | null;
  nextId: string | null;
  prevEventId: string | null;
  nextEventId: string | null;
  prevMediaUrl: string | null;
  nextMediaUrl: string | null;
}

// Get adjacent moments within the same event (used when navigating from event page)
async function getEventAdjacentMoments(
  eventId: string,
  currentCreatedAt: string,
  currentId: string
): Promise<AdjacentMoments> {
  const supabase = await createClient();

  // Get the previous moment (older, or wrap to last)
  const { data: prevData } = await supabase
    .from("moments")
    .select("id, media_url")
    .eq("event_id", eventId)
    .eq("status", "published")
    .or(`created_at.lt.${currentCreatedAt},and(created_at.eq.${currentCreatedAt},id.lt.${currentId})`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .single();

  // Get the next moment (newer, or wrap to first)
  const { data: nextData } = await supabase
    .from("moments")
    .select("id, media_url")
    .eq("event_id", eventId)
    .eq("status", "published")
    .or(`created_at.gt.${currentCreatedAt},and(created_at.eq.${currentCreatedAt},id.gt.${currentId})`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .single();

  let prevId = prevData?.id || null;
  let nextId = nextData?.id || null;
  let prevMediaUrl = prevData?.media_url || null;
  let nextMediaUrl = nextData?.media_url || null;

  // Wrap around: if no prev, get the last moment; if no next, get the first
  if (!prevId) {
    const { data: lastMoment } = await supabase
      .from("moments")
      .select("id, media_url")
      .eq("event_id", eventId)
      .eq("status", "published")
      .neq("id", currentId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .single();
    prevId = lastMoment?.id || null;
    prevMediaUrl = lastMoment?.media_url || null;
  }

  if (!nextId) {
    const { data: firstMoment } = await supabase
      .from("moments")
      .select("id, media_url")
      .eq("event_id", eventId)
      .eq("status", "published")
      .neq("id", currentId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .single();
    nextId = firstMoment?.id || null;
    nextMediaUrl = firstMoment?.media_url || null;
  }

  return { prevId, nextId, prevEventId: eventId, nextEventId: eventId, prevMediaUrl, nextMediaUrl };
}

// Get adjacent moments in the global feed (used when navigating from discovery page)
async function getFeedAdjacentMoments(
  currentCreatedAt: string,
  currentId: string
): Promise<AdjacentMoments> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_feed_adjacent_moments", {
    p_current_id: currentId,
    p_current_created_at: currentCreatedAt,
    p_content_types: ["photo", "video"],
  });

  if (error || !data || data.length === 0) {
    return { prevId: null, nextId: null, prevEventId: null, nextEventId: null, prevMediaUrl: null, nextMediaUrl: null };
  }

  const result = data[0];
  return {
    prevId: result.prev_id,
    nextId: result.next_id,
    prevEventId: result.prev_event_id,
    nextEventId: result.next_event_id,
    prevMediaUrl: result.prev_media_url || null,
    nextMediaUrl: result.next_media_url || null,
  };
}

interface MomentTranslations {
  textContent: string | null;
  originalTextContent: string | null;
  isTranslated: boolean;
  sourceLocale: ContentLocale | null;
}

async function getMomentTranslations(
  momentId: string,
  originalTextContent: string | null,
  sourceLocale: string | null,
  locale: string
): Promise<MomentTranslations> {
  if (!originalTextContent || !isValidContentLocale(locale)) {
    return {
      textContent: originalTextContent,
      originalTextContent,
      isTranslated: false,
      sourceLocale: null,
    };
  }

  const translations = await getTranslationsWithFallback(
    'moment',
    momentId,
    locale as ContentLocale,
    {
      title: null,
      description: null,
      text_content: originalTextContent,
      bio: null,
      story_content: null,
      technical_content: null,
      meta_description: null,
    }
  );

  const translatedText = translations.text_content || originalTextContent;
  const validSourceLocale = sourceLocale && isValidContentLocale(sourceLocale)
    ? sourceLocale as ContentLocale
    : null;

  return {
    textContent: translatedText,
    originalTextContent,
    isTranslated: translatedText !== originalTextContent,
    sourceLocale: validSourceLocale,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const moment = await getMoment(id);

  if (!moment) {
    return { title: "Moment not found" };
  }

  const locale = await getLocale();
  return generateMomentMetadata(moment, locale as Locale);
}

export default async function MomentPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;

  const supabase = await createClient();
  const moment = await getMoment(id);

  if (!moment) {
    notFound();
  }

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

  const [t, tCommon, locale] = await Promise.all([
    getTranslations("moments"),
    getTranslations("common"),
    getLocale(),
  ]);

  const event = moment.events;
  const profile = moment.profiles;
  const isVideo = isVideoUrl(moment.media_url);

  const timeAgo = formatDistanceToNow(new Date(moment.created_at), {
    addSuffix: true,
    locale: dateFnsLocales[locale as Locale],
  });

  // Get translations for text content
  const momentTranslations = await getMomentTranslations(
    moment.id,
    moment.text_content,
    moment.source_locale,
    locale
  );

  // Determine navigation mode based on where user came from
  const isDiscoveryMode = from === "moments";
  const isProfileMode = from === "profile";

  // Get adjacent moments for navigation (global feed or event-scoped)
  const { prevId, nextId, prevEventId, nextEventId, prevMediaUrl, nextMediaUrl } = isDiscoveryMode
    ? await getFeedAdjacentMoments(moment.created_at, moment.id)
    : await getEventAdjacentMoments(moment.event_id, moment.created_at, moment.id);

  const hasNavigation = prevId || nextId;

  // Check if navigating to a different event (for visual transition indicator)
  const prevCrossesEvent = prevEventId && prevEventId !== moment.event_id;
  const nextCrossesEvent = nextEventId && nextEventId !== moment.event_id;

  // Build navigation URLs with context preservation
  const navParam = isDiscoveryMode ? "?from=moments" : isProfileMode ? "?from=profile" : "";
  const backUrl = isDiscoveryMode
    ? "/moments"
    : isProfileMode
      ? `/${profile?.username || moment.user_id}`
      : `/events/${event.slug}/moments`;

  const momentSchema = generateMomentSchema(moment, locale);
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("moments"), url: "/moments" },
      { name: event.title, url: `/events/${event.slug}` },
    ],
    locale
  );

  return (
    <main className="min-h-screen">
      <JsonLd data={[momentSchema, breadcrumbSchema]} />
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
          <Link
            href={backUrl}
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>
          <div className="flex items-center gap-1">
            {/* Discovery mode indicator */}
            {isDiscoveryMode && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full mr-2">
                {t("discoveryMode")}
              </span>
            )}
            {user && (
              <Link
                href="/events/new"
                prefetch={false}
                className="flex p-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all rounded-md"
                aria-label="Create event"
              >
                <Plus className="w-5 h-5" />
              </Link>
            )}
            <Suspense>
              <AuthButton />
            </Suspense>
          </div>
        </div>
      </nav>

      <div className="container max-w-2xl mx-auto px-4 py-6">
        {/* Media display with navigation */}
        {moment.content_type !== "text" && moment.media_url && (
          <div className="relative aspect-square rounded-lg overflow-hidden bg-muted mb-6 group">
            {isVideo ? (
              <video
                key={moment.id}
                src={moment.media_url}
                className="w-full h-full object-contain"
                controls
                autoPlay
                muted
                playsInline
              />
            ) : (
              <ExpandableMomentImage
                src={moment.media_url}
                alt={momentTranslations.textContent || `Moment from ${event.title}`}
              />
            )}

            {/* Previous/Next navigation arrows */}
            {hasNavigation && (
              <>
                {prevId && (
                  <Link
                    href={`/moments/${prevId}${navParam}`}
                    className={`absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-white opacity-70 hover:opacity-100 active:scale-95 transition-all ${
                      prevCrossesEvent ? "bg-primary/70 ring-2 ring-primary/50" : "bg-black/50"
                    }`}
                    aria-label={tCommon("previous")}
                    title={prevCrossesEvent ? t("differentEvent") : undefined}
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </Link>
                )}
                {nextId && (
                  <Link
                    href={`/moments/${nextId}${navParam}`}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full text-white opacity-70 hover:opacity-100 active:scale-95 transition-all ${
                      nextCrossesEvent ? "bg-primary/70 ring-2 ring-primary/50" : "bg-black/50"
                    }`}
                    aria-label={tCommon("next")}
                    title={nextCrossesEvent ? t("differentEvent") : undefined}
                  >
                    <ChevronRight className="w-6 h-6" />
                  </Link>
                )}
              </>
            )}
          </div>
        )}

        {/* Navigation for text-only moments */}
        {moment.content_type === "text" && hasNavigation && (
          <div className="flex justify-between mb-6">
            {prevId ? (
              <Link
                href={`/moments/${prevId}${navParam}`}
                className={`flex items-center gap-1 hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg ${
                  prevCrossesEvent ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{prevCrossesEvent ? t("prevEvent") : tCommon("previous")}</span>
              </Link>
            ) : (
              <div />
            )}
            {nextId && (
              <Link
                href={`/moments/${nextId}${navParam}`}
                className={`flex items-center gap-1 hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg ${
                  nextCrossesEvent ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span>{nextCrossesEvent ? t("nextEvent") : tCommon("next")}</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        )}

        {/* User info and caption */}
        <div className="space-y-4">
          {/* User */}
          <div className="flex items-center gap-3">
            <Link href={`/${profile?.username || moment.user_id}`}>
              <UserAvatar
                src={profile?.avatar_url}
                alt={profile?.display_name || profile?.username || ""}
                size="md"
              />
            </Link>
            <div className="flex-1">
              <Link
                href={`/${profile?.username || moment.user_id}`}
                className="font-medium hover:underline"
              >
                {profile?.display_name || profile?.username || tCommon("anonymous")}
              </Link>
              <p className="text-sm text-muted-foreground">{timeAgo}</p>
            </div>
            {/* Delete button for owner/moderators */}
            <DeleteMomentButton
              momentId={moment.id}
              eventSlug={event.slug}
              isOwner={isOwner}
              canModerate={canModerate}
            />
          </div>

          {/* Caption / Text */}
          {momentTranslations.textContent && (
            <div className="space-y-2">
              <p className="text-lg whitespace-pre-wrap">{momentTranslations.textContent}</p>
              {momentTranslations.isTranslated && momentTranslations.sourceLocale && (
                <TranslatedFrom
                  sourceLocale={momentTranslations.sourceLocale}
                  originalText={momentTranslations.textContent !== momentTranslations.originalTextContent ? momentTranslations.originalTextContent ?? undefined : undefined}
                />
              )}
            </div>
          )}

          {/* Event card */}
          <Card className="mt-6">
            <CardContent className="p-4">
              <Link
                href={`/events/${event.slug}`}
                className="block hover:bg-muted -m-4 p-4 rounded-lg transition-colors"
              >
                <div className="flex gap-4">
                  {event.image_url && (
                    <Image
                      src={event.image_url}
                      alt={event.title || "Event image"}
                      width={80}
                      height={80}
                      className="rounded-lg object-cover"
                      unoptimized
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold line-clamp-2">{event.title}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatInDaLat(event.starts_at, "EEE, MMM d", locale as Locale)}</span>
                    </div>
                    {event.location_name && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <MapPin className="w-4 h-4" />
                        <span className="truncate">{decodeUnicodeEscapes(event.location_name)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* View all moments link */}
          <div className="text-center pt-4">
            <Link
              href={`/events/${event.slug}/moments`}
              className="text-primary hover:underline text-sm"
            >
              {t("viewAll")} →
            </Link>
          </div>
        </div>
      </div>

      {/* Preload adjacent images for instant navigation */}
      <MomentImagePreloader
        prevMediaUrl={prevMediaUrl}
        nextMediaUrl={nextMediaUrl}
      />
    </main>
  );
}
