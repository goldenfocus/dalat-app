import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  BadgeCheck,
  ExternalLink,
  Phone,
  Globe,
  Clock,
  Navigation,
  Wifi,
  Car,
  Trees,
  Dog,
  Accessibility,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatInDaLat } from "@/lib/timezone";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { Venue, Event, Locale, OperatingHours } from "@/lib/types";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import { VenueHoursBadge, isVenueOpenNow } from "@/components/venues/venue-hours-badge";
import { triggerHaptic } from "@/lib/haptics";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

interface VenueData {
  venue: Venue;
  upcoming_events: Event[];
  happening_now: Event[];
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

// Generate SEO metadata for venue pages
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const data = await getVenueData(slug);

  if (!data?.venue) {
    return { title: "Venue not found" };
  }

  const { venue } = data;
  const typeConfig = getVenueTypeConfig(venue.venue_type);

  return generateLocalizedMetadata({
    locale: locale as Locale,
    path: `/venues/${slug}`,
    title: venue.name,
    description:
      venue.description ||
      `${venue.name} - ${typeConfig.label} in Da Lat. ${
        data.upcoming_events.length
          ? `${data.upcoming_events.length} upcoming events.`
          : ""
      }`,
    keywords: [
      venue.name,
      typeConfig.label,
      "Da Lat",
      "venue",
      "events",
      ...(venue.tags || []),
    ],
    image: venue.cover_photo_url || venue.logo_url || undefined,
  });
}

// Generate venue structured data
function generateVenueSchema(venue: Venue, locale: string) {
  const typeConfig = getVenueTypeConfig(venue.venue_type);

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: venue.name,
    description: venue.description,
    image: venue.cover_photo_url || venue.logo_url,
    address: {
      "@type": "PostalAddress",
      streetAddress: venue.address,
      addressLocality: "Da Lat",
      addressRegion: "Lam Dong",
      addressCountry: "VN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: venue.latitude,
      longitude: venue.longitude,
    },
    url: venue.website_url,
    telephone: venue.phone,
    priceRange: venue.price_range,
    ...(venue.operating_hours && {
      openingHoursSpecification: formatOpeningHoursForSchema(venue.operating_hours),
    }),
  };
}

function formatOpeningHoursForSchema(hours: OperatingHours) {
  const dayMap: Record<keyof OperatingHours, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };

  return Object.entries(hours)
    .filter(([_, value]) => value && value !== "closed")
    .map(([day, value]) => {
      if (typeof value === "object" && "open" in value) {
        return {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: dayMap[day as keyof OperatingHours],
          opens: value.open,
          closes: value.close,
        };
      }
      return null;
    })
    .filter(Boolean);
}

const DAY_KEYS: (keyof OperatingHours)[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const AMENITY_ICONS = {
  has_wifi: Wifi,
  has_parking: Car,
  has_outdoor_seating: Trees,
  is_pet_friendly: Dog,
  is_wheelchair_accessible: Accessibility,
};

export default async function VenueProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const locale = (await getLocale()) as Locale;
  const [t, tCommon] = await Promise.all([
    getTranslations("venues"),
    getTranslations("common"),
  ]);

  const data = await getVenueData(slug);

  if (!data?.venue) {
    notFound();
  }

  const { venue, upcoming_events, happening_now, past_events_count, recent_activity } =
    data;

  const typeConfig = getVenueTypeConfig(venue.venue_type);
  const TypeIcon = typeConfig.icon;
  const isUnclaimed = !venue.owner_id;

  // Build structured data
  const venueSchema = generateVenueSchema(venue, locale);
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("title"), url: "/venues" },
      { name: venue.name, url: `/venues/${venue.slug}` },
    ],
    locale
  );

  // Get today's day for highlighting in hours
  const today = new Date()
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase() as keyof OperatingHours;

  // Amenities to display
  const amenities = [
    { key: "has_wifi", value: venue.has_wifi, label: t("amenities.wifi") },
    { key: "has_parking", value: venue.has_parking, label: t("amenities.parking") },
    {
      key: "has_outdoor_seating",
      value: venue.has_outdoor_seating,
      label: t("amenities.outdoorSeating"),
    },
    { key: "is_pet_friendly", value: venue.is_pet_friendly, label: t("amenities.petFriendly") },
    {
      key: "is_wheelchair_accessible",
      value: venue.is_wheelchair_accessible,
      label: t("amenities.wheelchair"),
    },
  ].filter((a) => a.value);

  return (
    <main className="min-h-screen pb-20">
      {/* JSON-LD Structured Data */}
      <JsonLd data={[venueSchema, breadcrumbSchema]} />

      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
          <Link
            href="/venues"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>
        </div>
      </nav>

      {/* Cover photo */}
      {venue.cover_photo_url ? (
        <div className="relative aspect-[2/1] sm:aspect-[3/1] bg-muted">
          <img
            src={venue.cover_photo_url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div
          className={`aspect-[3/1] flex items-center justify-center ${typeConfig.bgColor} ${typeConfig.darkBgColor}`}
        >
          <TypeIcon className={`w-16 h-16 ${typeConfig.color} ${typeConfig.darkColor}`} />
        </div>
      )}

      <div className="container max-w-4xl mx-auto px-4">
        {/* Venue header - overlapping cover */}
        <div className="flex items-start gap-4 -mt-8 sm:-mt-12 relative z-10">
          {/* Logo */}
          {venue.logo_url ? (
            <img
              src={venue.logo_url}
              alt={venue.name}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover border-4 border-background shadow-lg"
            />
          ) : (
            <div
              className={`w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-4 border-background shadow-lg flex items-center justify-center ${typeConfig.bgColor} ${typeConfig.darkBgColor}`}
            >
              <TypeIcon
                className={`w-10 h-10 sm:w-12 sm:h-12 ${typeConfig.color} ${typeConfig.darkColor}`}
              />
            </div>
          )}

          <div className="flex-1 pt-10 sm:pt-14">
            {/* Name and verified badge */}
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 flex-wrap">
              {venue.name}
              {venue.is_verified && (
                <BadgeCheck className="w-6 h-6 text-primary flex-shrink-0" />
              )}
            </h1>

            {/* Type and address */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded ${typeConfig.bgColor} ${typeConfig.darkBgColor} ${typeConfig.color} ${typeConfig.darkColor}`}
              >
                <TypeIcon className="w-3.5 h-3.5" />
                {typeConfig.label}
              </span>
              {venue.price_range && (
                <span className="text-sm text-muted-foreground">
                  {venue.price_range}
                </span>
              )}
              <VenueHoursBadge operatingHours={venue.operating_hours} />
            </div>

            {venue.address && (
              <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                {venue.address}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-6">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 active:scale-95 transition-all"
          >
            <Navigation className="w-4 h-4" />
            {t("getDirections")}
          </a>
          {venue.phone && (
            <a
              href={`tel:${venue.phone}`}
              className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/80 active:scale-95 transition-all"
            >
              <Phone className="w-4 h-4" />
              {t("callVenue")}
            </a>
          )}
          {venue.website_url && (
            <a
              href={venue.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/80 active:scale-95 transition-all"
            >
              <Globe className="w-4 h-4" />
              {t("visitWebsite")}
            </a>
          )}
        </div>

        {/* Happening Now section */}
        {happening_now.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              {t("happeningNow")}
            </h2>
            <div className="grid gap-4">
              {happening_now.map((event) => (
                <Link key={event.id} href={`/events/${event.slug}`}>
                  <Card className="hover:border-red-500/50 border-red-500/30 transition-colors overflow-hidden">
                    <CardContent className="p-0 flex">
                      {event.image_url && (
                        <img
                          src={event.image_url}
                          alt=""
                          className="w-24 h-24 object-cover flex-shrink-0"
                        />
                      )}
                      <div className="p-4 flex-1">
                        <h3 className="font-semibold line-clamp-1">{event.title}</h3>
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
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

        {/* Upcoming Events */}
        {upcoming_events.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-4">{t("upcomingEvents")}</h2>
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
                        <h3 className="font-semibold line-clamp-2">{event.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatInDaLat(event.starts_at, "EEE, MMM d 'at' h:mm a", locale)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* About section */}
        {(venue.description || amenities.length > 0) && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-4">{t("about")}</h2>
            {venue.description && (
              <p className="text-muted-foreground whitespace-pre-wrap">
                {venue.description}
              </p>
            )}
            {amenities.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {amenities.map(({ key, label }) => {
                  const Icon = AMENITY_ICONS[key as keyof typeof AMENITY_ICONS];
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </span>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Operating Hours */}
        {venue.operating_hours && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t("hours")}
            </h2>
            <div className="space-y-2">
              {DAY_KEYS.map((day) => {
                const hours = venue.operating_hours?.[day];
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    className={`flex justify-between py-2 px-3 rounded-lg ${
                      isToday ? "bg-primary/10 font-medium" : ""
                    }`}
                  >
                    <span className="capitalize">{day}</span>
                    <span className="text-muted-foreground">
                      {!hours || hours === "closed"
                        ? t("closedToday")
                        : `${hours.open} - ${hours.close}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Stats */}
        {(past_events_count > 0 || recent_activity.total_visitors > 0) && (
          <section className="mt-8">
            <div className="flex flex-wrap gap-4">
              {past_events_count > 0 && (
                <div className="flex-1 min-w-[120px] p-4 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{past_events_count}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("totalEventsHosted", { count: past_events_count })}
                  </p>
                </div>
              )}
              {recent_activity.total_visitors > 0 && (
                <div className="flex-1 min-w-[120px] p-4 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{recent_activity.total_visitors}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("recentActivity", { count: recent_activity.total_visitors })}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Claim venue banner */}
        {isUnclaimed && (
          <section className="mt-8 p-4 border border-dashed rounded-lg">
            <h3 className="font-semibold">{t("claimVenue")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("claimDescription")}
            </p>
          </section>
        )}

        {/* Empty state */}
        {upcoming_events.length === 0 && happening_now.length === 0 && (
          <section className="mt-8 text-center py-12">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">{t("noUpcomingEvents")}</p>
          </section>
        )}

        {/* Social links */}
        {(venue.facebook_url || venue.instagram_url || venue.zalo_url) && (
          <section className="mt-8 flex gap-4">
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
          </section>
        )}
      </div>
    </main>
  );
}
