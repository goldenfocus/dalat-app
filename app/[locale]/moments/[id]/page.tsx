import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  vi, ko, zhCN, ru, fr, ja, ms, th, de, es, id as idLocale, enUS
} from "date-fns/locale";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { isVideoUrl } from "@/lib/media-utils";
import { formatInDaLat } from "@/lib/timezone";
import { DeleteMomentButton } from "@/components/moments/delete-moment-button";
import { TranslatedFrom } from "@/components/ui/translation-badge";
import { getTranslationsWithFallback, isValidContentLocale } from "@/lib/translations";
import type { Moment, Event, Profile, ContentLocale, Locale } from "@/lib/types";

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

  return data as MomentWithDetails;
}

interface AdjacentMoments {
  prevId: string | null;
  nextId: string | null;
}

async function getAdjacentMoments(
  eventId: string,
  currentCreatedAt: string,
  currentId: string
): Promise<AdjacentMoments> {
  const supabase = await createClient();

  // Get the previous moment (older, or wrap to last)
  const { data: prevData } = await supabase
    .from("moments")
    .select("id")
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
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "published")
    .or(`created_at.gt.${currentCreatedAt},and(created_at.eq.${currentCreatedAt},id.gt.${currentId})`)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .single();

  let prevId = prevData?.id || null;
  let nextId = nextData?.id || null;

  // Wrap around: if no prev, get the last moment; if no next, get the first
  if (!prevId) {
    const { data: lastMoment } = await supabase
      .from("moments")
      .select("id")
      .eq("event_id", eventId)
      .eq("status", "published")
      .neq("id", currentId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .single();
    prevId = lastMoment?.id || null;
  }

  if (!nextId) {
    const { data: firstMoment } = await supabase
      .from("moments")
      .select("id")
      .eq("event_id", eventId)
      .eq("status", "published")
      .neq("id", currentId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .single();
    nextId = firstMoment?.id || null;
  }

  return { prevId, nextId };
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

  const userName = moment.profiles?.display_name || moment.profiles?.username || "Someone";
  const eventTitle = moment.events?.title || "an event";
  const description = moment.text_content
    ? moment.text_content.slice(0, 150)
    : `${userName} shared a moment from ${eventTitle}`;

  return {
    title: `${userName}'s moment at ${eventTitle} | dalat.app`,
    description,
    openGraph: {
      title: `${userName}'s moment at ${eventTitle}`,
      description,
      type: "article",
      url: `/moments/${id}`,
      siteName: "dalat.app",
      ...(moment.media_url && !isVideoUrl(moment.media_url) && {
        images: [
          {
            url: moment.media_url,
            width: 1200,
            height: 630,
            alt: `Moment from ${eventTitle}`,
          },
        ],
      }),
    },
    twitter: {
      card: moment.media_url ? "summary_large_image" : "summary",
      title: `${userName}'s moment at ${eventTitle}`,
      description,
      ...(moment.media_url && !isVideoUrl(moment.media_url) && {
        images: [moment.media_url],
      }),
    },
  };
}

export default async function MomentPage({ params }: PageProps) {
  const { id } = await params;
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdminOrMod = profile?.role === "admin" || profile?.role === "moderator";
  }

  const canModerate = isEventCreator || isAdminOrMod;

  const [t, tCommon, tEvents, locale] = await Promise.all([
    getTranslations("moments"),
    getTranslations("common"),
    getTranslations("events"),
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

  // Get adjacent moments for navigation
  const { prevId, nextId } = await getAdjacentMoments(
    moment.event_id,
    moment.created_at,
    moment.id
  );
  const hasNavigation = prevId || nextId;

  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
          <Link
            href={`/events/${event.slug}/moments`}
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>
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
                playsInline
              />
            ) : (
              <img
                src={moment.media_url}
                alt=""
                className="w-full h-full object-contain"
              />
            )}

            {/* Previous/Next navigation arrows */}
            {hasNavigation && (
              <>
                {prevId && (
                  <Link
                    href={`/moments/${prevId}`}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white opacity-70 hover:opacity-100 active:scale-95 transition-all"
                    aria-label={tCommon("previous")}
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </Link>
                )}
                {nextId && (
                  <Link
                    href={`/moments/${nextId}`}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white opacity-70 hover:opacity-100 active:scale-95 transition-all"
                    aria-label={tCommon("next")}
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
                href={`/moments/${prevId}`}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{tCommon("previous")}</span>
              </Link>
            ) : (
              <div />
            )}
            {nextId && (
              <Link
                href={`/moments/${nextId}`}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
              >
                <span>{tCommon("next")}</span>
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
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20" />
              )}
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
                    <img
                      src={event.image_url}
                      alt=""
                      className="w-20 h-20 rounded-lg object-cover"
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
                        <span className="truncate">{event.location_name}</span>
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
    </main>
  );
}