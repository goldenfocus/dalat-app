import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Repeat,
  ExternalLink,
  CalendarPlus,
} from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatInDaLat } from "@/lib/timezone";
import { describeRRule, getShortRRuleLabel } from "@/lib/recurrence";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { EventSeries, Event, Profile, Organizer, Locale } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

type SeriesWithRelations = EventSeries & {
  profiles: Profile;
  organizers: Organizer | null;
};

type EventInstance = Pick<Event, "id" | "slug" | "starts_at" | "series_instance_date" | "status">;

interface SeriesData {
  series: SeriesWithRelations;
  upcomingEvents: EventInstance[];
  subscriberCount: number;
  isSubscribed: boolean;
  isOwner: boolean;
}

// Generate dynamic OG metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: series } = await supabase
    .from("event_series")
    .select("title, description, image_url, location_name, rrule")
    .eq("slug", slug)
    .single();

  if (!series) {
    return { title: "Series not found" };
  }

  const recurrenceLabel = getShortRRuleLabel(series.rrule);
  const description = series.description
    ? `${series.description.slice(0, 150)}${series.description.length > 150 ? "..." : ""}`
    : `${recurrenceLabel}${series.location_name ? ` · ${series.location_name}` : ""} · ĐàLạt.app`;

  return {
    title: `${series.title} | ĐàLạt.app`,
    description,
    openGraph: {
      title: series.title,
      description,
      type: "website",
      url: `/series/${slug}`,
      siteName: "ĐàLạt.app",
      ...(series.image_url && {
        images: [{ url: series.image_url, width: 1200, height: 630, alt: series.title }],
      }),
    },
  };
}

async function getSeriesData(slug: string): Promise<SeriesData | null> {
  const supabase = await createClient();

  // Get series
  const { data: series, error } = await supabase
    .from("event_series")
    .select("*, profiles:created_by(*), organizers:organizer_id(*)")
    .eq("slug", slug)
    .single();

  if (error || !series) return null;

  // Get upcoming events
  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("id, slug, starts_at, series_instance_date, status")
    .eq("series_id", series.id)
    .eq("status", "published")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(10);

  // Get subscriber count
  const { count: subscriberCount } = await supabase
    .from("series_rsvps")
    .select("*", { count: "exact", head: true })
    .eq("series_id", series.id)
    .eq("auto_rsvp", true);

  // Check current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isSubscribed = false;
  if (user) {
    const { data: subscription } = await supabase
      .from("series_rsvps")
      .select("auto_rsvp")
      .eq("series_id", series.id)
      .eq("user_id", user.id)
      .single();
    isSubscribed = subscription?.auto_rsvp ?? false;
  }

  return {
    series: series as SeriesWithRelations,
    upcomingEvents: (upcomingEvents || []) as EventInstance[],
    subscriberCount: subscriberCount || 0,
    isSubscribed,
    isOwner: user?.id === series.created_by,
  };
}

export default async function SeriesPage({ params }: PageProps) {
  const { slug } = await params;
  const [t, locale] = await Promise.all([
    getTranslations(),
    getLocale(),
  ]);

  const data = await getSeriesData(slug);

  if (!data) {
    notFound();
  }

  const { series, upcomingEvents, subscriberCount, isSubscribed: _isSubscribed, isOwner } = data;

  const recurrenceDescription = describeRRule(series.rrule);
  const calendarUrl = `/api/series/${series.slug}/calendar.ics`;

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Back Navigation */}
        <Link
          href="/"
          className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t("common.back")}</span>
        </Link>

        {/* Series Header Card */}
        <Card>
          <CardContent className="p-0">
            {/* Cover Image */}
            {series.image_url ? (
              <div className="aspect-[2/1] relative">
                <img
                  src={series.image_url}
                  alt={series.title}
                  className="w-full h-full object-cover rounded-t-lg"
                />
              </div>
            ) : (
              <div className="aspect-[2/1] bg-gradient-to-br from-primary/20 to-primary/5 rounded-t-lg flex items-center justify-center">
                <Repeat className="w-16 h-16 text-primary/40" />
              </div>
            )}

            <div className="p-6 space-y-4">
              {/* Badge */}
              <Badge variant="secondary" className="gap-1">
                <Repeat className="w-3 h-3" />
                {t("series.recurringSeries")}
              </Badge>

              {/* Title */}
              <h1 className="text-2xl font-bold">{series.title}</h1>

              {/* Recurrence Pattern */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{recurrenceDescription}</span>
                {series.starts_at_time && (
                  <span className="text-foreground font-medium">
                    at {series.starts_at_time.slice(0, 5)}
                  </span>
                )}
              </div>

              {/* Location */}
              {series.location_name && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <span>{decodeUnicodeEscapes(series.location_name)}</span>
                    {series.address && (
                      <p className="text-sm">{series.address}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Subscribers */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{t("series.subscribers", { count: subscriberCount })}</span>
              </div>

              {/* Description */}
              {series.description && (
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {series.description}
                </p>
              )}

              {/* External Link */}
              {series.external_chat_url && (
                <a
                  href={series.external_chat_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("events.moreInfo")}
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button asChild variant="outline" className="flex-1">
            <a href={calendarUrl} download>
              <CalendarPlus className="w-4 h-4 mr-2" />
              {t("calendar.addToCalendar")}
            </a>
          </Button>

          {isOwner && (
            <Button asChild variant="outline">
              <Link href={`/series/${series.slug}/edit`}>{t("series.editSeries")}</Link>
            </Button>
          )}
        </div>

        {/* Upcoming Dates */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t("series.upcomingDates")}</h2>

          {upcomingEvents.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <p>{t("series.noUpcomingDates")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <Link key={event.id} href={`/events/${event.slug}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center">
                          <span className="text-xs text-muted-foreground uppercase">
                            {formatInDaLat(event.starts_at, "EEE", locale as Locale)}
                          </span>
                          <span className="text-lg font-bold text-primary">
                            {formatInDaLat(event.starts_at, "d", locale as Locale)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">
                            {formatInDaLat(event.starts_at, "EEEE, MMMM d", locale as Locale)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatInDaLat(event.starts_at, "h:mm a", locale as Locale)}
                          </p>
                        </div>
                      </div>
                      <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {upcomingEvents.length >= 10 && (
            <p className="text-sm text-muted-foreground text-center">
              {t("series.moreDates")}
            </p>
          )}
        </section>

        {/* Organizer Info */}
        {series.organizers && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("series.organizedBy")}</h2>
            <Link href={`/organizers/${series.organizers.slug}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  {series.organizers.logo_url ? (
                    <img
                      src={series.organizers.logo_url}
                      alt={series.organizers.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Users className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{series.organizers.name}</p>
                    <p className="text-sm text-muted-foreground">{t("series.viewProfile")}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </section>
        )}

        {/* Creator Info (if no organizer) */}
        {!series.organizers && series.profiles && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("series.createdBy")}</h2>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                {series.profiles.avatar_url ? (
                  <img
                    src={series.profiles.avatar_url}
                    alt={series.profiles.display_name || "Creator"}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Users className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-medium">
                    {series.profiles.display_name || series.profiles.username || "Anonymous"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </main>
  );
}
