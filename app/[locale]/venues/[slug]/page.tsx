import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  BadgeCheck,
  ExternalLink,
  Clock,
  Route,
  Globe,
  Phone,
  Mail,
  Wifi,
  Car,
  Sun,
  Dog,
  Accessibility,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatInDaLat } from "@/lib/timezone";
import type { Venue, Locale } from "@/lib/types";
import { generateVenueMetadata } from "@/lib/metadata";
import { JsonLd, generateLocalBusinessSchema, generateBreadcrumbSchema } from "@/lib/structured-data";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import { VenueHoursBadge } from "@/components/venues/venue-hours-badge";
import { getTranslationsWithFallback } from "@/lib/translations";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

interface VenueData {
  venue: Venue;
  upcoming_events: Array<{
    id: string;
    slug: string;
    title: string;
    image_url: string | null;
    starts_at: string;
    ends_at: string | null;
    capacity: number | null;
  }>;
  happening_now: Array<{
    id: string;
    slug: string;
    title: string;
    image_url: string | null;
    starts_at: string;
    ends_at: string | null;
  }>;
  past_events_count: number;
  recent_activity: {
    events_this_month: number;
    total_visitors: number;
  };
}

async function getVenueData(slug: string): Promise<VenueData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_venue_by_slug", {
    p_slug: slug,
  });

  if (error || !data) {
    console.error("Error fetching venue:", error);
    return null;
  }

  return data as VenueData;
}

async function isUserLoggedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const venueData = await getVenueData(slug);

  if (!venueData) {
    return { title: "Venue not found" };
  }

  return generateVenueMetadata(
    venueData.venue,
    locale as Locale,
    venueData.upcoming_events.length
  );
}

export default async function VenuePage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("venues");

  const venueData = await getVenueData(slug);

  if (!venueData) {
    notFound();
  }

  const { venue, upcoming_events, happening_now, past_events_count, recent_activity } = venueData;
  const isLoggedIn = await isUserLoggedIn();

  // Fetch translations for venue name and description
  const venueTranslations = await getTranslationsWithFallback(
    "venue",
    venue.id,
    locale as Locale,
    {
      title: venue.name,
      description: venue.description,
      text_content: null,
      bio: null,
      story_content: null,
      technical_content: null,
      meta_description: null,
    }
  );
  const translatedName = venueTranslations.title ?? venue.name;
  const translatedDescription = venueTranslations.description ?? venue.description;

  const isUnclaimed = !venue.owner_id;
  const showClaimBanner = isUnclaimed && isLoggedIn && !venue.is_verified;

  const typeConfig = venue.venue_type ? getVenueTypeConfig(venue.venue_type) : null;
  const TypeIcon = typeConfig?.icon;

  const localBusinessSchema = generateLocalBusinessSchema(venue, locale, upcoming_events.length);
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("title"), url: "/venues" },
      { name: translatedName, url: `/venues/${venue.slug}` },
    ],
    locale
  );

  const daysOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const dayLabels: Record<string, string> = {
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
  };

  const amenities = [
    { key: "wifi", icon: Wifi, has: venue.has_wifi, label: t("amenities.wifi") },
    { key: "parking", icon: Car, has: venue.has_parking, label: t("amenities.parking") },
    { key: "outdoor", icon: Sun, has: venue.has_outdoor_seating, label: t("amenities.outdoorSeating") },
    { key: "pet", icon: Dog, has: venue.is_pet_friendly, label: t("amenities.petFriendly") },
    { key: "wheelchair", icon: Accessibility, has: venue.is_wheelchair_accessible, label: t("amenities.wheelchair") },
  ].filter((a) => a.has);

  return (
    <main className="min-h-screen pb-8">
      <JsonLd data={[localBusinessSchema, breadcrumbSchema]} />

      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
          <Link
            href="/venues"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("title")}</span>
          </Link>
        </div>
      </nav>

      {/* Cover photo */}
      {venue.cover_photo_url && (
        <div className="aspect-[2/1] sm:aspect-[3/1] bg-muted overflow-hidden">
          <img
            src={venue.cover_photo_url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="container max-w-4xl mx-auto px-4">
        {/* Venue header */}
        <div className={`flex items-start gap-4 sm:gap-6 py-6 ${venue.cover_photo_url ? "-mt-12 relative" : ""}`}>
          {/* Logo */}
          {venue.logo_url ? (
            <img
              src={venue.logo_url}
              alt={translatedName}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover border-4 border-background shadow-lg bg-background"
            />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-primary/10 flex items-center justify-center border-4 border-background shadow-lg">
              {TypeIcon ? (
                <TypeIcon className={`w-10 h-10 ${typeConfig?.color}`} />
              ) : (
                <MapPin className="w-10 h-10 text-primary" />
              )}
            </div>
          )}

          <div className={venue.cover_photo_url ? "flex-1 pt-12 sm:pt-14" : "flex-1"}>
            {/* Name and badges */}
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 flex-wrap">
              {translatedName}
              {venue.is_verified && (
                <BadgeCheck className="w-6 h-6 text-primary flex-shrink-0" />
              )}
            </h1>

            {/* Type and open status */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {typeConfig && TypeIcon && (
                <span
                  className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded ${typeConfig.bgColor} ${typeConfig.darkBgColor} ${typeConfig.color} ${typeConfig.darkColor}`}
                >
                  <TypeIcon className="w-3.5 h-3.5" />
                  {typeConfig.label}
                </span>
              )}
              {venue.operating_hours && (
                <VenueHoursBadge operatingHours={venue.operating_hours} />
              )}
              {venue.price_range && (
                <span className="text-sm text-muted-foreground">
                  {venue.price_range}
                </span>
              )}
            </div>

            {/* Address */}
            {venue.address && (
              <p className="text-sm text-muted-foreground mt-2 flex items-start gap-1">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {venue.address}
              </p>
            )}
          </div>
        </div>

        {/* Claim banner */}
        {showClaimBanner && (
          <div className="mb-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {t("claimVenue")}
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {t("claimDescription")}
            </p>
          </div>
        )}

        {/* Action buttons - min-h-11 ensures 44px touch targets */}
        <div className="flex flex-wrap gap-2 mb-6">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all"
          >
            <Route className="w-4 h-4" />
            {t("getDirections")}
          </a>

          {venue.website_url && (
            <a
              href={venue.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
            >
              <Globe className="w-4 h-4" />
              Website
            </a>
          )}

          {venue.phone && (
            <a
              href={`tel:${venue.phone}`}
              className="flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
            >
              <Phone className="w-4 h-4" />
              {venue.phone}
            </a>
          )}

          {venue.email && (
            <a
              href={`mailto:${venue.email}`}
              className="flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
            >
              <Mail className="w-4 h-4" />
              Email
            </a>
          )}
        </div>

        {/* Happening now */}
        {happening_now.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              {t("happeningNow")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {happening_now.map((event) => (
                <Link key={event.id} href={`/events/${event.slug}`}>
                  <Card className="hover:border-red-500/50 border-red-500/30 transition-colors overflow-hidden">
                    <CardContent className="p-0">
                      {event.image_url && (
                        <img
                          src={event.image_url}
                          alt=""
                          className="w-full aspect-[2/1] object-cover"
                        />
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold mb-1">{event.title}</h3>
                        <p className="text-sm text-red-600 dark:text-red-400">
                          Live now
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming events */}
        {upcoming_events.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">{t("upcomingEvents")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {upcoming_events.map((event) => (
                <Link key={event.id} href={`/events/${event.slug}`}>
                  <Card className="hover:border-primary/50 transition-colors overflow-hidden">
                    <CardContent className="p-0">
                      {event.image_url && (
                        <img
                          src={event.image_url}
                          alt=""
                          className="w-full aspect-[2/1] object-cover"
                        />
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold mb-2">{event.title}</h3>
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {formatInDaLat(event.starts_at, "EEE, MMM d 'at' h:mm a", locale as Locale)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* No events state */}
        {upcoming_events.length === 0 && happening_now.length === 0 && (
          <section className="mb-8 text-center py-8 bg-muted/30 rounded-lg">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{t("noUpcomingEvents")}</p>
          </section>
        )}

        {/* About section */}
        {translatedDescription && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">{t("about")}</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">{translatedDescription}</p>
          </section>
        )}

        {/* Amenities */}
        {amenities.length > 0 && (
          <section className="mb-8">
            <div className="flex flex-wrap gap-2">
              {amenities.map((amenity) => (
                <span
                  key={amenity.key}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm"
                >
                  <amenity.icon className="w-4 h-4" />
                  {amenity.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Operating hours */}
        {venue.operating_hours && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t("hours")}
            </h2>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="grid gap-2">
                {daysOfWeek.map((day) => {
                  const hours = venue.operating_hours?.[day];
                  const today = new Date();
                  const daLatTime = new Date(today.getTime() + 7 * 60 * 60 * 1000);
                  const currentDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][daLatTime.getUTCDay()];
                  const isToday = currentDay === day;

                  return (
                    <div
                      key={day}
                      className={`flex justify-between items-center py-1 px-2 rounded ${
                        isToday ? "bg-primary/10 font-medium" : ""
                      }`}
                    >
                      <span className={isToday ? "text-primary" : "text-muted-foreground"}>
                        {dayLabels[day]}
                        {isToday && " (Today)"}
                      </span>
                      <span className={hours === "closed" || !hours ? "text-muted-foreground" : ""}>
                        {hours === "closed" || !hours
                          ? "Closed"
                          : `${hours.open} - ${hours.close}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Activity stats */}
        {(past_events_count > 0 || recent_activity.total_visitors > 0) && (
          <section className="mb-8">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {past_events_count > 0 && (
                <span>
                  {past_events_count} {t("pastEvents").toLowerCase()}
                </span>
              )}
              {recent_activity.total_visitors > 0 && (
                <span>
                  {t("recentActivity", { count: recent_activity.total_visitors })}
                </span>
              )}
            </div>
          </section>
        )}

        {/* Social links */}
        {(venue.facebook_url || venue.instagram_url || venue.zalo_url) && (
          <section className="border-t border-border pt-6">
            <div className="flex gap-4">
              {venue.facebook_url && (
                <a
                  href={venue.facebook_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  Facebook
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {venue.instagram_url && (
                <a
                  href={venue.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  Instagram
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {venue.zalo_url && (
                <a
                  href={venue.zalo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  Zalo
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
