import { notFound, redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import { Suspense } from "react";
import type { Metadata } from "next";

// Increase serverless function timeout (Vercel Pro required for >10s)
export const maxDuration = 60;
import { Calendar, MapPin, Users, ExternalLink, Link2, Repeat } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTranslationsWithFallback, isValidContentLocale } from "@/lib/translations";
import type { ContentLocale, Locale } from "@/lib/types";
import { JsonLd, generateEventSchema, generateBreadcrumbSchema } from "@/lib/structured-data";
import { TranslatedFrom } from "@/components/ui/translation-badge";
import { Card, CardContent } from "@/components/ui/card";
import { RsvpButton } from "@/components/events/rsvp-button";
import { FeedbackBadge } from "@/components/events/event-feedback";
import { SeriesBadge } from "@/components/events/series-badge";
import { EventActions } from "@/components/events/event-actions";
import { InviteModal } from "@/components/events/invite-modal";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { CopyAddress } from "@/components/events/copy-address";
import { ConfirmAttendanceHandler } from "@/components/events/confirm-attendance-handler";
import { AttendeeList } from "@/components/events/attendee-list";
import { EventMediaDisplay } from "@/components/events/event-media-display";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { formatInDaLat } from "@/lib/timezone";
import { MoreFromOrganizer } from "@/components/events/more-from-organizer";
import { Linkify } from "@/lib/linkify";
import { MomentsPreview } from "@/components/moments";
import { SponsorDisplay } from "@/components/events/sponsor-display";
import { SiteHeader } from "@/components/site-header";
import type { Event, EventCounts, Rsvp, Profile, Organizer, MomentWithProfile, MomentCounts, EventSettings, Sponsor, EventSponsor, UserRole, EventSeries } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Generate dynamic OG metadata for social sharing
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, image_url, location_name, starts_at")
    .eq("slug", slug)
    .single();

  if (!event) {
    return {
      title: "Event not found",
    };
  }

  // Get translated content for the current locale
  const translations = isValidContentLocale(locale)
    ? await getTranslationsWithFallback(
        "event",
        event.id,
        locale as ContentLocale,
        {
          title: event.title,
          description: event.description,
          text_content: null,
          bio: null,
        }
      )
    : { title: event.title, description: event.description };

  const title = translations.title || event.title;
  const eventDescription = translations.description ?? event.description;

  const eventDate = formatInDaLat(event.starts_at, "EEE, MMM d 'at' h:mm a");
  const description = eventDescription
    ? `${eventDescription.slice(0, 150)}${eventDescription.length > 150 ? "..." : ""}`
    : `${eventDate}${event.location_name ? ` · ${event.location_name}` : ""} · dalat.app`;

  // Use absolute URL with locale for proper link previews on messaging apps
  const canonicalUrl = `https://dalat.app/${locale}/events/${slug}`;

  // Explicit OG image URL for WhatsApp compatibility
  // WhatsApp requires explicit og:image meta tag (doesn't auto-detect opengraph-image.tsx)
  const ogImageUrl = `https://dalat.app/${locale}/events/${slug}/opengraph-image`;

  return {
    title: `${title} | dalat.app`,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalUrl,
      siteName: "dalat.app",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

type EventWithJoins = Event & {
  profiles: Profile;
  organizers: Organizer | null;
  event_series: Pick<EventSeries, "slug" | "title" | "rrule"> | null;
};

type GetEventResult =
  | { type: "found"; event: EventWithJoins }
  | { type: "redirect"; newSlug: string }
  | { type: "not_found" };

async function getEvent(slug: string): Promise<GetEventResult> {
  const supabase = await createClient();

  // First, try to find by current slug
  const { data: event, error } = await supabase
    .from("events")
    .select("*, profiles(*), organizers(*), event_series(slug, title, rrule)")
    .eq("slug", slug)
    .single();

  if (!error && event) {
    return { type: "found", event: event as EventWithJoins };
  }

  // If not found, check if this is an old slug that needs redirect
  const { data: eventByOldSlug } = await supabase
    .from("events")
    .select("slug")
    .contains("previous_slugs", [slug])
    .single();

  if (eventByOldSlug) {
    return { type: "redirect", newSlug: eventByOldSlug.slug };
  }

  return { type: "not_found" };
}

async function getOrganizerEvents(organizerId: string): Promise<Event[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", organizerId)
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(10);

  return (data ?? []) as Event[];
}

async function getEventCounts(eventId: string): Promise<EventCounts | null> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_event_counts", {
    p_event_id: eventId,
  });

  return data as EventCounts | null;
}

interface FeedbackStats {
  total: number;
  positive_percentage: number | null;
  amazing: number;
  good: number;
  okay: number;
  not_great: number;
}

async function getFeedbackStats(eventId: string): Promise<FeedbackStats | null> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_event_feedback_stats", {
    p_event_id: eventId,
  });

  return data as FeedbackStats | null;
}

async function getCurrentUserRsvp(eventId: string): Promise<Rsvp | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("rsvps")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .single();

  return data as Rsvp | null;
}

async function getWaitlistPosition(eventId: string, userId: string | null): Promise<number | null> {
  if (!userId) return null;

  const supabase = await createClient();

  // Get all waitlist entries ordered by created_at (FIFO)
  const { data } = await supabase
    .from("rsvps")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("status", "waitlist")
    .order("created_at", { ascending: true });

  if (!data) return null;

  const position = data.findIndex((rsvp) => rsvp.user_id === userId);
  return position >= 0 ? position + 1 : null; // 1-indexed position
}

interface UserFeedback {
  rating?: string;
  comment?: string;
  marked_no_show?: boolean;
}

async function getUserFeedback(eventId: string): Promise<UserFeedback | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Check if user marked as no-show
  const { data: rsvp } = await supabase
    .from("rsvps")
    .select("marked_no_show")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .single();

  if (rsvp?.marked_no_show) {
    return { marked_no_show: true };
  }

  // Check for actual feedback
  const { data: feedback } = await supabase
    .from("event_feedback")
    .select("rating, comment")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .single();

  if (feedback) {
    return { rating: feedback.rating, comment: feedback.comment ?? undefined };
  }

  return null;
}

// Combined RSVP fetch - reduces 3 parallel queries to 1
interface AllRsvpsResult {
  attendees: (Rsvp & { profiles: Profile })[];
  waitlist: (Rsvp & { profiles: Profile })[];
  interested: (Rsvp & { profiles: Profile })[];
}

async function getAllRsvps(eventId: string): Promise<AllRsvpsResult> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("rsvps")
    .select("*, profiles(*)")
    .eq("event_id", eventId)
    .in("status", ["going", "waitlist", "interested"])
    .order("created_at", { ascending: true });

  const rsvps = (data ?? []) as (Rsvp & { profiles: Profile })[];

  return {
    attendees: rsvps.filter((r) => r.status === "going"),
    waitlist: rsvps.filter((r) => r.status === "waitlist"),
    interested: rsvps.filter((r) => r.status === "interested"),
  };
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function getCurrentUserRole(userId: string | null): Promise<UserRole | null> {
  if (!userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return (data?.role as UserRole) ?? null;
}

async function getMomentsPreview(eventId: string): Promise<MomentWithProfile[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_event_moments", {
    p_event_id: eventId,
    p_limit: 4,
    p_offset: 0,
  });

  return (data ?? []) as MomentWithProfile[];
}

async function getMomentCounts(eventId: string): Promise<MomentCounts | null> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_moment_counts", {
    p_event_id: eventId,
  });

  return data as MomentCounts | null;
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

async function getEventSponsors(eventId: string): Promise<(EventSponsor & { sponsors: Sponsor })[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("event_sponsors")
    .select("*, sponsors(*)")
    .eq("event_id", eventId)
    .order("sort_order");

  return (data ?? []) as (EventSponsor & { sponsors: Sponsor })[];
}

async function canUserPostMoment(eventId: string, userId: string | null, creatorId: string): Promise<boolean> {
  if (!userId) return false;

  // Creator can always post
  if (userId === creatorId) return true;

  const supabase = await createClient();
  const settings = await getEventSettings(eventId);

  // If settings exist and moments_enabled is explicitly false, only creator can post
  if (settings && !settings.moments_enabled) return false;

  // Default to 'anyone' if no settings exist (moments enabled by default)
  const whoCanPost = settings?.moments_who_can_post ?? "anyone";

  switch (whoCanPost) {
    case "anyone":
      return true;
    case "rsvp":
      const { data: rsvp } = await supabase
        .from("rsvps")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .single();
      return rsvp?.status && ["going", "waitlist", "interested"].includes(rsvp.status);
    case "confirmed":
      const { data: confirmedRsvp } = await supabase
        .from("rsvps")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .single();
      return confirmedRsvp?.status === "going";
    default:
      return false;
  }
}

interface EventTranslations {
  title: string;
  description: string | null;
  originalTitle: string;
  originalDescription: string | null;
  isTranslated: boolean;
  sourceLocale: ContentLocale | null;
}

async function getEventTranslations(
  eventId: string,
  originalTitle: string,
  originalDescription: string | null,
  sourceLocale: string | null,
  locale: string
): Promise<EventTranslations> {
  // Validate locale
  if (!isValidContentLocale(locale)) {
    return {
      title: originalTitle,
      description: originalDescription,
      originalTitle,
      originalDescription,
      isTranslated: false,
      sourceLocale: null,
    };
  }

  const translations = await getTranslationsWithFallback(
    'event',
    eventId,
    locale as ContentLocale,
    {
      title: originalTitle,
      description: originalDescription,
      text_content: null,
      bio: null,
    }
  );

  const translatedTitle = translations.title || originalTitle;
  const translatedDescription = translations.description ?? originalDescription;
  const validSourceLocale = sourceLocale && isValidContentLocale(sourceLocale)
    ? sourceLocale as ContentLocale
    : null;

  return {
    title: translatedTitle,
    description: translatedDescription,
    originalTitle,
    originalDescription,
    isTranslated: translatedTitle !== originalTitle || translatedDescription !== originalDescription,
    sourceLocale: validSourceLocale,
  };
}

export default async function EventPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const result = await getEvent(slug);

  if (result.type === "not_found") {
    notFound();
  }

  if (result.type === "redirect") {
    // Preserve any query params (like ?confirm=yes from notifications)
    const queryParams = await searchParams;
    const queryString = Object.entries(queryParams)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map(v => `${key}=${encodeURIComponent(v)}`).join("&");
        }
        return `${key}=${encodeURIComponent(value as string)}`;
      })
      .join("&");
    redirect(`/events/${result.newSlug}${queryString ? `?${queryString}` : ""}`);
  }

  const event = result.event;
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("events"),
    getTranslations("common"),
    getLocale(),
  ]);

  const currentUserId = await getCurrentUserId();
  const currentUserRole = await getCurrentUserRole(currentUserId);

  // Optimized: Combined RSVP fetch (3 queries -> 1), plus other parallel fetches
  const [counts, currentRsvp, allRsvps, waitlistPosition, userFeedback, feedbackStats, organizerEvents, momentsPreview, momentCounts, canPostMoment, sponsors, eventTranslations] = await Promise.all([
    getEventCounts(event.id),
    getCurrentUserRsvp(event.id),
    getAllRsvps(event.id), // Combined fetch for attendees, waitlist, interested
    getWaitlistPosition(event.id, currentUserId),
    getUserFeedback(event.id),
    getFeedbackStats(event.id),
    event.organizer_id ? getOrganizerEvents(event.organizer_id) : Promise.resolve([]),
    getMomentsPreview(event.id),
    getMomentCounts(event.id),
    canUserPostMoment(event.id, currentUserId, event.created_by),
    getEventSponsors(event.id),
    getEventTranslations(event.id, event.title, event.description, event.source_locale, locale),
  ]);

  // Destructure combined RSVP result
  const { attendees, waitlist, interested } = allRsvps;

  const isLoggedIn = !!currentUserId;
  const isCreator = currentUserId === event.created_by;
  const isAdmin = currentUserRole === "admin";
  const canManageEvent = isCreator || isAdmin;

  const spotsText = event.capacity
    ? `${counts?.going_spots ?? 0}/${event.capacity}`
    : `${counts?.going_spots ?? 0}`;

  // Check if event is past (same logic as rsvp-button)
  const isPast = (() => {
    const now = new Date();
    if (event.ends_at) {
      return new Date(event.ends_at) < now;
    }
    const startDate = new Date(event.starts_at);
    const defaultEnd = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
    return defaultEnd < now;
  })();

  // Generate structured data for SEO and AEO
  const eventSchema = generateEventSchema(event, locale, counts?.going_spots);
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Events", url: "/" },
      { name: event.title, url: `/events/${event.slug}` },
    ],
    locale
  );

  return (
    <main className="min-h-screen">
      {/* JSON-LD Structured Data for SEO/AEO */}
      <JsonLd data={[eventSchema, breadcrumbSchema]} />

      <Suspense fallback={null}>
        <ConfirmAttendanceHandler eventId={event.id} />
      </Suspense>

      <SiteHeader
        actions={
          canManageEvent ? (
            <>
              <InviteModal
                eventSlug={event.slug}
                eventTitle={event.title}
                eventDescription={event.description}
                startsAt={event.starts_at}
              />
              <EventActions eventId={event.id} eventSlug={event.slug} />
            </>
          ) : undefined
        }
      />

      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event image/video - clickable to view full */}
            {event.image_url ? (
              <EventMediaDisplay src={event.image_url} alt={event.title} />
            ) : (
              <EventDefaultImage
                title={event.title}
                className="w-full rounded-lg"
                priority
              />
            )}

            {/* Title and description */}
            <div>
              <h1 className="text-3xl font-bold mb-2">{eventTranslations.title}</h1>
              {/* Series context - show if this event is part of a recurring series */}
              {event.event_series && (
                <Link
                  href={`/series/${event.event_series.slug}`}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3 -mt-1"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>
                    {t("partOfSeries", { seriesName: event.event_series.title })}
                  </span>
                  {event.event_series.rrule && (
                    <SeriesBadge rrule={event.event_series.rrule} className="ml-1" />
                  )}
                </Link>
              )}
              {/* Show translation indicator with original */}
              {eventTranslations.isTranslated && eventTranslations.sourceLocale && (
                <TranslatedFrom
                  sourceLocale={eventTranslations.sourceLocale}
                  originalText={eventTranslations.title !== eventTranslations.originalTitle ? eventTranslations.originalTitle : undefined}
                  className="mb-4"
                />
              )}
              {eventTranslations.description && (
                <div className="text-muted-foreground whitespace-pre-wrap">
                  <Linkify text={eventTranslations.description} />
                </div>
              )}
            </div>

            {/* Sponsors */}
            {sponsors.length > 0 && (
              <SponsorDisplay sponsors={sponsors} />
            )}

            {/* Attendees */}
            <AttendeeList attendees={attendees} waitlist={waitlist} interested={interested} />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* RSVP card */}
            <Card>
              <CardContent className="p-4 space-y-4">
                {/* Date/time */}
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {formatInDaLat(event.starts_at, "EEEE, MMMM d", locale as Locale)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatInDaLat(event.starts_at, "h:mm a", locale as Locale)}
                      {event.ends_at &&
                        ` - ${formatInDaLat(event.ends_at, "h:mm a", locale as Locale)}`}
                    </p>
                  </div>
                </div>

                {/* Location */}
                {(event.location_name || event.address) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div className="space-y-1">
                      {event.location_name && (
                        <p className="font-medium">{event.location_name}</p>
                      )}
                      {event.address && (
                        <CopyAddress address={event.address} />
                      )}
                      {event.google_maps_url && (
                        <a
                          href={event.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                        >
                          {t("viewOnMap")}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Spots - only show counts to logged-in users */}
                {isLoggedIn ? (
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {spotsText} {isPast ? t("went") : t("going")}
                        {(counts?.interested_count ?? 0) > 0 && (
                          <span className="text-muted-foreground font-normal">
                            {" "}· {counts?.interested_count} {t("interested")}
                          </span>
                        )}
                      </p>
                      {(counts?.waitlist_count ?? 0) > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {counts?.waitlist_count} {t("onWaitlist")}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      {t("signInToSeeAttendees")}
                    </p>
                  </div>
                )}

                {/* External link */}
                {event.external_chat_url && (
                  <a
                    href={event.external_chat_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Link2 className="w-4 h-4" />
                    {t("moreInfo")}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                <hr />

                {/* RSVP button */}
                <RsvpButton
                  eventId={event.id}
                  eventTitle={event.title}
                  capacity={event.capacity}
                  goingSpots={counts?.going_spots ?? 0}
                  currentRsvp={currentRsvp}
                  isLoggedIn={isLoggedIn}
                  waitlistPosition={waitlistPosition}
                  startsAt={event.starts_at}
                  endsAt={event.ends_at}
                  existingFeedback={userFeedback}
                />

                {/* Feedback stats for past events */}
                {feedbackStats && feedbackStats.total > 0 && (
                  <div className="flex justify-center">
                    <FeedbackBadge
                      positivePercentage={feedbackStats.positive_percentage}
                      totalFeedback={feedbackStats.total}
                    />
                  </div>
                )}

                {/* Add to calendar */}
                <AddToCalendar
                  title={event.title}
                  description={event.description}
                  locationName={event.location_name}
                  address={event.address}
                  googleMapsUrl={event.google_maps_url}
                  startsAt={event.starts_at}
                  endsAt={event.ends_at}
                  url={`https://dalat.app/events/${event.slug}`}
                />
              </CardContent>
            </Card>

            {/* Organizer */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-2">
                  {t("organizedBy")}
                </p>
                <Link
                  href={
                    event.organizers?.slug
                      ? `/organizers/${event.organizers.slug}`
                      : `/${event.profiles?.username || event.created_by}`
                  }
                  className="flex items-center gap-3 hover:bg-muted p-2 -m-2 rounded-lg transition-colors"
                >
                  {event.organizers?.logo_url || event.profiles?.avatar_url ? (
                    <img
                      src={(event.organizers?.logo_url || event.profiles?.avatar_url) ?? undefined}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20" />
                  )}
                  <span className="font-medium">
                    {event.organizers?.name ||
                      event.profiles?.display_name ||
                      event.profiles?.username ||
                      tCommon("anonymous")}
                  </span>
                </Link>
              </CardContent>
            </Card>

            {/* Moments preview */}
            <MomentsPreview
              eventSlug={event.slug}
              moments={momentsPreview}
              counts={momentCounts}
              canPost={canPostMoment}
            />

            {/* More from organizer */}
            {event.organizers && organizerEvents.length > 1 && (
              <MoreFromOrganizer
                organizer={event.organizers}
                events={organizerEvents}
                currentEventId={event.id}
                locale={locale as Locale}
              />
            )}
          </div>
        </div>
      </div>

    </main>
  );
}
