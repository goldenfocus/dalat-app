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
  Globe,
  Phone,
  Mail,
  Wifi,
  Car,
  Sun,
  Dog,
  Accessibility,
  Camera,
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
import { PhotoGallery } from "@/components/ui/photo-gallery";
import { VenueSectionNav } from "@/components/venues/venue-section-nav";
import { PastEventsSection } from "@/components/venues/past-events-section";
import { VenueMap } from "@/components/venues/venue-map";
import { VenueCommunityPhotos } from "@/components/venues/venue-community-photos";
import { VenueOfficialPhotosUpload } from "@/components/venues/venue-official-photos-upload";
import { CopyAddress } from "@/components/events/copy-address";
import { hasRoleLevel, type UserRole } from "@/lib/types";

/** Extract username/handle from Instagram URL */
function extractInstagramHandle(url: string): string {
  try {
    const match = url.match(/instagram\.com\/([^/?#]+)/i);
    return match ? `@${match[1]}` : url;
  } catch {
    return url;
  }
}

/** Extract page name from Facebook URL */
function extractFacebookDisplay(url: string): string {
  try {
    const match = url.match(/facebook\.com\/([^/?#]+)/i);
    return match ? match[1] : url;
  } catch {
    return url;
  }
}

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

interface PastEvent {
  id: string;
  slug: string;
  title: string;
  image_url: string | null;
  starts_at: string;
  ends_at: string | null;
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

async function getPastEvents(venueId: string): Promise<PastEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, slug, title, image_url, starts_at, ends_at")
    .eq("venue_id", venueId)
    .eq("status", "published")
    .lt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false })
    .limit(12);

  if (error) {
    console.error("Error fetching past events:", error);
    return [];
  }

  return data || [];
}

async function isUserLoggedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

async function canUserManageVenue(venueOwnerId: string | null): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // Check if user is venue owner
  if (venueOwnerId === user.id) return true;

  // Check if user has admin/moderator role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role) {
    return hasRoleLevel(profile.role as UserRole, "moderator");
  }

  return false;
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
  const [isLoggedIn, pastEvents, canManageVenue] = await Promise.all([
    isUserLoggedIn(),
    getPastEvents(venue.id),
    canUserManageVenue(venue.owner_id),
  ]);

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

  // Build dynamic sections for navigation
  const hasEvents = upcoming_events.length > 0 || happening_now.length > 0;
  const hasPhotos = venue.photos && venue.photos.length > 0;
  const hasHours = !!venue.operating_hours;
  const hasContact = venue.address || venue.phone || venue.email || venue.website_url || venue.facebook_url || venue.instagram_url || venue.zalo_url;

  const sections = [
    { id: "overview", label: t("overview") },
    hasEvents && { id: "events", label: t("upcomingEvents") },
    hasPhotos && { id: "gallery", label: t("gallery") },
    hasHours && { id: "hours", label: t("hours") },
    hasContact && { id: "contact", label: t("contact") },
  ].filter((s): s is { id: string; label: string } => !!s);

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

      {/* Hero Section with Cover Photo */}
      {venue.cover_photo_url ? (
        <div className="relative">
          {/* Cover Image */}
          <div className="aspect-[16/9] sm:aspect-[2.5/1] bg-muted overflow-hidden">
            <img
              src={venue.cover_photo_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          {/* Hero Content */}
          <div className="absolute bottom-0 left-0 right-0">
            <div className="container max-w-4xl mx-auto px-4 pb-6 sm:pb-8">
              <div className="flex items-end gap-4 sm:gap-6">
                {/* Logo */}
                {venue.logo_url ? (
                  <img
                    src={venue.logo_url}
                    alt={translatedName}
                    className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl object-cover border-4 border-white/20 shadow-2xl bg-background"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border-4 border-white/20 shadow-2xl">
                    {TypeIcon ? (
                      <TypeIcon className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                    ) : (
                      <MapPin className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                    )}
                  </div>
                )}

                <div className="flex-1 pb-1">
                  {/* Verified Badge */}
                  {venue.is_verified && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-primary/20 text-primary-foreground backdrop-blur-sm mb-2">
                      <BadgeCheck className="w-3.5 h-3.5" />
                      {t("verified")}
                    </span>
                  )}

                  {/* Name */}
                  <h1 className="text-2xl sm:text-4xl font-bold text-white drop-shadow-lg">
                    {translatedName}
                  </h1>

                  {/* Type, open status, price */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {typeConfig && TypeIcon && (
                      <span className="inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded bg-white/20 text-white backdrop-blur-sm">
                        <TypeIcon className="w-3.5 h-3.5" />
                        {typeConfig.label}
                      </span>
                    )}
                    {venue.operating_hours && (
                      <VenueHoursBadge operatingHours={venue.operating_hours} />
                    )}
                    {venue.price_range && (
                      <span className="text-sm text-white/80">
                        {venue.price_range}
                      </span>
                    )}
                  </div>

                  {/* Address */}
                  {venue.address && (
                    <p className="text-sm text-white/70 mt-2 flex items-start gap-1">
                      <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {venue.address}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* No cover photo - simple header */
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-start gap-4 sm:gap-6">
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

            <div className="flex-1">
              {/* Verified Badge */}
              {venue.is_verified && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary mb-2">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  {t("verified")}
                </span>
              )}

              {/* Name */}
              <h1 className="text-2xl sm:text-3xl font-bold">
                {translatedName}
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
        </div>
      )}

      <div className="container max-w-4xl mx-auto px-4 pt-6">
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

        {/* Section Navigation */}
        <VenueSectionNav sections={sections} />

        {/* Overview Section */}
        <section id="overview" className="pt-6">
          {/* About section */}
          {translatedDescription && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">{t("about")}</h2>
              <p className="text-muted-foreground whitespace-pre-wrap">{translatedDescription}</p>
            </div>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <div className="mb-8">
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
            </div>
          )}
        </section>

        {/* Events Section */}
        <section id="events" className="pt-2">
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
          <div className="mb-8 text-center py-8 bg-muted/30 rounded-lg">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{t("noUpcomingEvents")}</p>
          </div>
        )}

        {/* Past Events */}
        <PastEventsSection
          events={pastEvents}
          locale={locale as Locale}
          label={t("pastEvents")}
        />
        </section>

        {/* Gallery Section */}
        {(venue.photos && venue.photos.length > 0) || canManageVenue ? (
          <section id="gallery" className="mb-8 pt-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Camera className="w-5 h-5" />
                {t("photos")}
              </h2>
              {canManageVenue && (
                <VenueOfficialPhotosUpload
                  venueId={venue.id}
                  currentPhotos={venue.photos || []}
                />
              )}
            </div>
            {venue.photos && venue.photos.length > 0 && (
              <PhotoGallery photos={venue.photos} />
            )}
          </section>
        ) : null}

        {/* Community Photos Section */}
        <VenueCommunityPhotos venueId={venue.id} locale={locale} />

        {/* Hours Section */}
        {venue.operating_hours && (
          <section id="hours" className="mb-8 pt-2">
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

        {/* Contact Section */}
        {(venue.address || venue.phone || venue.email || venue.website_url || venue.facebook_url || venue.instagram_url || venue.zalo_url) && (
          <section id="contact" className="mb-8 pt-2 border-t border-border">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 pt-4">
              <Mail className="w-5 h-5" />
              {t("contact")}
            </h2>

            {/* Copyable address */}
            {venue.address && (
              <div className="mb-4 p-3 rounded-lg bg-muted/30">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <CopyAddress address={venue.address} />
                </div>
              </div>
            )}

            {/* Contact info grid */}
            <div className="grid gap-3 sm:grid-cols-2 mb-4">
              {venue.phone && (
                <a
                  href={`tel:${venue.phone}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted active:scale-[0.98] transition-all"
                >
                  <Phone className="w-5 h-5 text-muted-foreground" />
                  <span>{venue.phone}</span>
                </a>
              )}
              {venue.email && (
                <a
                  href={`mailto:${venue.email}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted active:scale-[0.98] transition-all"
                >
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <span className="truncate">{venue.email}</span>
                </a>
              )}
              {venue.website_url && (
                <a
                  href={venue.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted active:scale-[0.98] transition-all"
                >
                  <Globe className="w-5 h-5 text-muted-foreground" />
                  <span className="truncate">Website</span>
                  <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
                </a>
              )}
            </div>

            {/* Social links with icons */}
            {(venue.facebook_url || venue.instagram_url || venue.zalo_url) && (
              <div className="flex flex-wrap gap-3">
                {venue.facebook_url && (
                  <a
                    href={venue.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted active:scale-[0.98] transition-all text-sm"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#1877F2]">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    <span className="text-muted-foreground">{extractFacebookDisplay(venue.facebook_url)}</span>
                  </a>
                )}
                {venue.instagram_url && (
                  <a
                    href={venue.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted active:scale-[0.98] transition-all text-sm"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5">
                      <defs>
                        <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#FFDC80"/>
                          <stop offset="25%" stopColor="#F77737"/>
                          <stop offset="50%" stopColor="#E1306C"/>
                          <stop offset="75%" stopColor="#C13584"/>
                          <stop offset="100%" stopColor="#833AB4"/>
                        </linearGradient>
                      </defs>
                      <path fill="url(#instagram-gradient)" d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
                    </svg>
                    <span className="text-muted-foreground">{extractInstagramHandle(venue.instagram_url)}</span>
                  </a>
                )}
                {venue.zalo_url && (
                  <a
                    href={venue.zalo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted active:scale-[0.98] transition-all text-sm"
                  >
                    <svg viewBox="0 0 48 48" className="w-5 h-5">
                      <path fill="#2196F3" d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4z"/>
                      <path fill="#FFF" d="M32.5 15h-17c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h2v4l5-4h10c1.1 0 2-.9 2-2V17c0-1.1-.9-2-2-2zM18 23h-2v-5h2v5zm8 0h-6v-1h4v-1h-3c-.6 0-1-.4-1-1v-2h6v1h-4v1h3c.6 0 1 .4 1 1v2zm6 0h-2v-5h2v5z"/>
                    </svg>
                    <span className="text-muted-foreground">Zalo</span>
                  </a>
                )}
              </div>
            )}

            {/* Map */}
            <div className="mt-6">
              <VenueMap
                latitude={venue.latitude}
                longitude={venue.longitude}
                name={translatedName}
                address={venue.address}
                directionsLabel={t("getDirections")}
                viewOnMapLabel={t("viewOnMap")}
              />
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
      </div>
    </main>
  );
}
