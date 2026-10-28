import { translatedFields } from "@/lib/translations/public-content";
import { OriginalText } from "@/components/ui/original-text";
import { getEventTranslationsBatch } from "@/lib/translations";
import { ExperienceList } from "@/components/experiences/list";
import { Link } from "@/lib/i18n/routing";
import {
  Calendar,
  MapPin,
  BadgeCheck,
  Clock,
  Globe,
  Mail,
  Wifi,
  Car,
  Sun,
  Dog,
  Accessibility,
  Camera,
  Tag,
  BookOpen,
  ExternalLink,
  Star,
  Navigation,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import type { Venue, Locale } from "@/lib/types";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import { VenueHoursBadge } from "@/components/venues/venue-hours-badge";
import { PhoneActionButton } from "@/components/venues/phone-action-button";
import { getTranslationsWithFallback } from "@/lib/translations";
import { PhotoGallery } from "@/components/ui/photo-gallery";
import { PastEventsSection } from "@/components/venues/past-events-section";
import { VenueMap } from "@/components/venues/venue-map";
import {
  VenueGallery,
  type VenueGalleryPhoto,
} from "@/components/venues/venue-gallery";
import { VenueCommunityPhotos } from "@/components/venues/venue-community-photos";
import { VenuePhotoManager } from "@/components/venues/venue-photo-manager";
import { VenueShareButton } from "@/components/venues/venue-share-button";
import { VenueCopyAddress } from "@/components/venues/venue-copy-address";
import { hasRoleLevel, type UserRole } from "@/lib/types";
import { JsonLd } from "@/lib/structured-data";
import { getVenuePastEventsPath } from "@/lib/venues/routes";
import { localeUrl } from "@/lib/i18n/locale-url";
import { getPublicMenu } from "@/lib/menu/queries";
import { generateMenuSchema, venueMenuPath } from "@/lib/menu/schema";
import { MenuSections } from "@/components/menu/menu-sections";

interface VenueContentProps {
  venueId: string;
  locale: string;
}

interface LinkedOrganizer {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  is_verified: boolean;
  website_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
}

interface VenueData {
  venue: Venue;
  organizer: LinkedOrganizer | null;
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

async function getVenueDataById(venueId: string): Promise<VenueData | null> {
  const supabase = await createClient();

  // First get the venue
  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .select("*")
    .eq("id", venueId)
    .single();

  if (venueError || !venue) {
    return null;
  }

  // Get linked organizer if exists
  let organizer: LinkedOrganizer | null = null;
  if (venue.organizer_id) {
    const { data: orgData } = await supabase
      .from("organizers")
      .select(
        "id, slug, name, logo_url, is_verified, website_url, facebook_url, instagram_url",
      )
      .eq("id", venue.organizer_id)
      .single();
    organizer = orgData;
  }

  // Get upcoming events
  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("id, slug, title, image_url, starts_at, ends_at, capacity")
    .eq("venue_id", venueId)
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(6);

  // Get happening now events
  // Events with ends_at in the future, OR events with no ends_at that started within the last 4 hours
  const now = new Date();
  const nowISO = now.toISOString();
  const fourHoursAgo = new Date(
    now.getTime() - 4 * 60 * 60 * 1000,
  ).toISOString();
  const { data: happeningNow } = await supabase
    .from("events")
    .select("id, slug, title, image_url, starts_at, ends_at")
    .eq("venue_id", venueId)
    .eq("status", "published")
    .lte("starts_at", nowISO)
    .or(
      `ends_at.gte.${nowISO},and(ends_at.is.null,starts_at.gte.${fourHoursAgo})`,
    )
    .order("starts_at", { ascending: true })
    .limit(3);

  // Get past events count
  const { count: pastEventsCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId)
    .eq("status", "published")
    .lt("starts_at", nowISO);

  return {
    venue: venue as Venue,
    organizer,
    upcoming_events: upcomingEvents || [],
    happening_now: happeningNow || [],
    past_events_count: pastEventsCount || 0,
    recent_activity: {
      events_this_month: 0,
      total_visitors: 0,
    },
  };
}

async function getPastEvents(venueId: string): Promise<PastEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, slug, title, image_url, starts_at, ends_at")
    .eq("venue_id", venueId)
    .eq("status", "published")
    .lt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false })
    .limit(12);

  return data || [];
}

async function isUserLoggedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

async function canUserManageVenue(
  venueOwnerId: string | null,
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;
  if (venueOwnerId === user.id) return true;

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

export async function VenueContent({ venueId, locale }: VenueContentProps) {
  const t = await getTranslations("venues");

  const venueData = await getVenueDataById(venueId);

  if (!venueData) {
    return null;
  }

  const {
    venue,
    organizer,
    upcoming_events,
    happening_now,
    past_events_count,
    recent_activity: _recent_activity,
  } = venueData;
  const [_isLoggedIn, pastEvents, canManageVenue] = await Promise.all([
    isUserLoggedIn(),
    getPastEvents(venue.id),
    canUserManageVenue(venue.owner_id),
  ]);

  // Fetch translations for venue description only. The official name is canonical.
  const venueTranslations = await getTranslationsWithFallback(
    "venue",
    venue.id,
    locale as Locale,
    { description: venue.description },
  );
  const extraTranslations = await translatedFields("venue", venue.id, locale);
  let localizedPhotos = venue.photos || [];
  let localizedTags = venue.tags || [];
  try {
    const photos = JSON.parse(extraTranslations.get("photos") || "null");
    if (Array.isArray(photos) && photos.length === localizedPhotos.length)
      localizedPhotos = localizedPhotos.map((photo, index) => ({
        ...photo,
        caption:
          typeof photos[index]?.caption === "string"
            ? photos[index].caption
            : photo.caption,
      }));
    const tags = JSON.parse(extraTranslations.get("tags") || "null");
    if (
      Array.isArray(tags) &&
      tags.length === localizedTags.length &&
      tags.every((tag) => typeof tag === "string")
    )
      localizedTags = tags;
  } catch {
    /* Keep source data when a translation is malformed. */
  }
  const translatedDescription =
    venueTranslations.description ?? venue.description;
  const eventTitles = await getEventTranslationsBatch(
    [...upcoming_events, ...happening_now].map((event) => event.id),
    locale as Locale,
  );
  const translatedAddress =
    venue.address?.replace(/\bWard\b/g, t("ward")) ?? null;

  const menu = await getPublicMenu(venue.id, locale);
  const tMenu = await getTranslations("venueMenu");
  const menuUrl = localeUrl(locale as Locale, venueMenuPath(venue.slug));

  // Own photos first, then Google Places photos (proxied, attributed, never stored).
  const placePhoto = (name: string, w: number) =>
    `/api/places/photo?w=${w}&name=${encodeURIComponent(name)}`;
  const gallery: VenueGalleryPhoto[] = [
    ...(venue.cover_photo_url
      ? [
          {
            id: "cover",
            src: venue.cover_photo_url,
            thumb: venue.cover_photo_url,
            alt: venue.name,
          },
        ]
      : []),
    ...localizedPhotos
      .filter((p) => p.url && p.url !== venue.cover_photo_url)
      .map((p, i) => ({
        id: `own-${i}`,
        src: p.url,
        thumb: p.url,
        alt: p.caption || venue.name,
        caption: p.caption || null,
        originalCaption:
          venue.photos?.find((photo) => photo.url === p.url)?.caption || null,
      })),
    ...(venue.google_photos || []).slice(0, 8).map((p, i) => ({
      id: `g-${i}`,
      src: placePhoto(p.name, 1600),
      thumb: placePhoto(p.name, 640),
      alt: venue.name,
      googleAuthors: p.attributions || [],
    })),
  ];
  const heroImage = gallery[0]?.thumb
    ? gallery[0].googleAuthors
      ? placePhoto(venue.google_photos![0].name, 1600)
      : gallery[0].src
    : null;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    [venue.name, venue.address].filter(Boolean).join(", "),
  )}${venue.google_place_id ? `&destination_place_id=${encodeURIComponent(venue.google_place_id)}` : ""}`;
  const mapsUrl =
    venue.google_maps_url ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue.name, venue.address].filter(Boolean).join(", "))}`;
  const rating =
    venue.google_rating != null ? (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm"
      >
        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
        <span className="font-semibold">{venue.google_rating.toFixed(1)}</span>
        <span className="opacity-80">
          {t("googleReviewCount", {
            count: venue.google_user_rating_count || 0,
          })}
        </span>
      </a>
    ) : null;
  const hoursSpec = venue.operating_hours
    ? Object.entries(venue.operating_hours)
        .filter(([, h]) => h && h !== "closed")
        .map(([day, h]) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${day.charAt(0).toUpperCase()}${day.slice(1)}`,
          opens: (h as { open: string }).open,
          closes: (h as { close: string }).close,
        }))
    : [];
  const ownImages = gallery.filter((g) => !g.googleAuthors).map((g) => g.src);

  const isUnclaimed = !venue.owner_id;

  const typeConfig = venue.venue_type
    ? getVenueTypeConfig(venue.venue_type)
    : null;
  const TypeIcon = typeConfig?.icon;

  // Build LocalBusiness structured data for rich SEO
  const localBusinessSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type":
      venue.venue_type === "restaurant" ||
      venue.venue_type === "vegetarian" ||
      venue.venue_type === "vegan"
        ? "Restaurant"
        : venue.venue_type === "cafe"
          ? "CafeOrCoffeeShop"
          : venue.venue_type === "bar"
            ? "BarOrPub"
            : venue.venue_type === "hotel"
              ? "Hotel"
              : venue.venue_type === "park"
                ? "Park"
                : "LocalBusiness",
    name: venue.name,
    description:
      translatedDescription ||
      venue.description ||
      `${venue.name} in Da Lat, Vietnam`,
    url: `https://dalat.app/${venue.slug}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: venue.address || "",
      addressLocality: "Da Lat",
      addressRegion: "Lam Dong",
      addressCountry: "VN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: venue.latitude,
      longitude: venue.longitude,
    },
    ...(venue.logo_url && { logo: venue.logo_url }),
    ...(ownImages.length && { image: ownImages.slice(0, 10) }),
    ...(hoursSpec.length && { openingHoursSpecification: hoursSpec }),
    hasMap: mapsUrl,
    ...(venue.phone && { telephone: venue.phone }),
    ...(venue.email && { email: venue.email }),
    sameAs: [
      venue.google_maps_url,
      venue.website_url,
      venue.facebook_url,
      venue.instagram_url,
    ].filter(Boolean),
    ...(venue.price_range && { priceRange: venue.price_range }),
    ...(menu.length > 0 && { hasMenu: menuUrl }),
    ...(venue.is_verified && {
      isAccessibleForFree: venue.venue_type === "park",
    }),
  };

  const formatEventDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Ho_Chi_Minh",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  const daysOfWeek = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ] as const;
  const dayLabels = Object.fromEntries(
    daysOfWeek.map((day, index) => [
      day,
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2026, 0, 5 + index))),
    ]),
  );

  const amenities = [
    {
      key: "wifi",
      icon: Wifi,
      has: venue.has_wifi,
      label: t("amenities.wifi"),
    },
    {
      key: "parking",
      icon: Car,
      has: venue.has_parking,
      label: t("amenities.parking"),
    },
    {
      key: "outdoor",
      icon: Sun,
      has: venue.has_outdoor_seating,
      label: t("amenities.outdoorSeating"),
    },
    {
      key: "pet",
      icon: Dog,
      has: venue.is_pet_friendly,
      label: t("amenities.petFriendly"),
    },
    {
      key: "wheelchair",
      icon: Accessibility,
      has: venue.is_wheelchair_accessible,
      label: t("amenities.wheelchair"),
    },
  ].filter((a) => a.has);

  return (
    <>
      <JsonLd
        data={
          menu.length > 0
            ? [localBusinessSchema, generateMenuSchema(venue, menu, locale)]
            : localBusinessSchema
        }
      />

      {/* Hero Section with Cover Photo */}
      {heroImage ? (
        <div className="relative">
          <div className="aspect-[16/9] sm:aspect-[2.5/1] bg-muted overflow-hidden">
            <img
              src={heroImage}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

          <div className="absolute bottom-0 left-0 right-0">
            <div className="container max-w-4xl mx-auto px-4 pb-6 sm:pb-8">
              <div className="flex items-end gap-4 sm:gap-6">
                {venue.logo_url ? (
                  <img
                    src={venue.logo_url}
                    alt={venue.name}
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
                  {venue.is_verified && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-primary/20 text-primary-foreground backdrop-blur-sm mb-2">
                      <BadgeCheck className="w-3.5 h-3.5" />
                      {t("verified")}
                    </span>
                  )}

                  <h1 className="text-2xl sm:text-4xl font-bold text-white drop-shadow-lg">
                    {venue.name}
                  </h1>
                  {rating && (
                    <div className="mt-1 text-white drop-shadow">{rating}</div>
                  )}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {typeConfig && TypeIcon && venue.venue_type && (
                      <span className="inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded bg-white/20 text-white backdrop-blur-sm">
                        <TypeIcon className="w-3.5 h-3.5" />
                        {t(`types.${venue.venue_type}`)}
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

                  {venue.address && (
                    <p className="text-sm text-white/70 mt-2 flex items-start gap-1">
                      <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {translatedAddress}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-start gap-4 sm:gap-6">
            {venue.logo_url ? (
              <img
                src={venue.logo_url}
                alt={venue.name}
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
              {venue.is_verified && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary mb-2">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  {t("verified")}
                </span>
              )}

              <h1 className="text-2xl sm:text-3xl font-bold">{venue.name}</h1>
              {rating && <div className="mt-1">{rating}</div>}

              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {typeConfig && TypeIcon && venue.venue_type && (
                  <span
                    className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded ${typeConfig.bgColor} ${typeConfig.darkBgColor} ${typeConfig.color} ${typeConfig.darkColor}`}
                  >
                    <TypeIcon className="w-3.5 h-3.5" />
                    {t(`types.${venue.venue_type}`)}
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

              {venue.address && (
                <p className="text-sm text-muted-foreground mt-2 flex items-start gap-1">
                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {translatedAddress}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="container max-w-4xl mx-auto px-4 pt-6">
        {/* Claim / manage */}
        {isUnclaimed && !venue.is_verified ? (
          <Link
            href={`/venues/${venue.slug}/claim`}
            className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30"
          >
            <span>
              <span className="block font-medium text-amber-900 dark:text-amber-100">
                {t("claimVenue")}
              </span>
              <span className="block text-sm text-amber-800/80 dark:text-amber-200/80">
                {t("claimDescription")}
              </span>
            </span>
            <BadgeCheck className="h-5 w-5 shrink-0 text-amber-700" />
          </Link>
        ) : canManageVenue ? (
          <Link
            href={`/venues/${venue.slug}/edit`}
            className="mb-6 inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {t("editVenuePage")}
          </Link>
        ) : null}

        <div className="mb-4">
          <VenueShareButton
            name={venue.name}
            shareText={venue.name}
            url={`https://dalat.app${localeUrl(locale as Locale, `/${venue.slug}`)}`}
            label={t("shareVenue")}
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {venue.phone && (
            <PhoneActionButton
              phone={venue.phone}
              zaloUrl={venue.zalo_url}
              className="flex items-center justify-center w-11 h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
            />
          )}

          {venue.email && (
            <a
              href={`mailto:${venue.email}`}
              className="flex items-center justify-center w-11 h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
              aria-label="Email"
            >
              <Mail className="w-4 h-4" />
            </a>
          )}

          {venue.website_url && (
            <a
              href={venue.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-11 h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
              aria-label="Website"
            >
              <Globe className="w-4 h-4" />
            </a>
          )}

          {venue.facebook_url && (
            <a
              href={venue.facebook_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-11 h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
              aria-label="Facebook"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
          )}

          {venue.instagram_url && (
            <a
              href={venue.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-11 h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
              aria-label="Instagram"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
              </svg>
            </a>
          )}
        </div>

        {/* Directions — the first thing a visitor needs */}
        <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.99]"
          >
            <Navigation className="h-4 w-4" />
            {t("directionsGoogle")}
          </a>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 py-3 font-medium hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" />
            {t("openInGoogleMaps")}
          </a>
        </div>

        <VenueGallery photos={gallery} venueName={venue.name} />

        {/* About section */}
        {translatedDescription && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">{t("about")}</h2>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {translatedDescription}
            </p>
            {translatedDescription !== venue.description &&
              venue.description && (
                <OriginalText
                  text={venue.description}
                  sourceLocale={venue.source_locale || undefined}
                />
              )}
          </section>
        )}

        {/* Menu — full text on the page so crawlers + AI answer engines can quote dishes and prices */}
        {menu.length > 0 && (
          <section id="menu" className="mb-8 scroll-mt-20">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">{tMenu("menuTitle")}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {canManageVenue && (
                  <Link
                    href={`/venues/${venue.slug}/edit/menu`}
                    className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted active:scale-95"
                  >
                    {tMenu("manageMenu")}
                  </Link>
                )}
                <Link
                  href={`/venues/${venue.slug}/menu`}
                  className="inline-flex min-h-11 items-center text-sm underline underline-offset-2"
                >
                  {tMenu("viewFullMenu")}
                </Link>
              </div>
            </div>
            {venue.preorder_enabled && (
              <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                {tMenu("preorderBanner")}
              </p>
            )}
            <MenuSections sections={menu} locale={locale} showNav={false} />
          </section>
        )}

        {/* From Google (attributed, cached; not our own reviews) */}
        {(venue.google_editorial_summary ||
          (venue.google_reviews?.length ?? 0) > 0) && (
          <section className="mb-8 space-y-3">
            <h2 className="text-xl font-semibold">{t("fromGoogle")}</h2>
            {venue.google_editorial_summary && (
              <p className="text-muted-foreground">
                {venue.google_editorial_summary}
              </p>
            )}
            {(venue.google_reviews || []).slice(0, 3).map((r, i) => (
              <figure key={i} className="rounded-xl border p-4">
                <blockquote className="line-clamp-4 text-sm">
                  {r.text}
                </blockquote>
                <figcaption className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {r.rating != null && (
                    <span>{"★".repeat(Math.round(r.rating))}</span>
                  )}
                  {r.authorUri ? (
                    <a
                      href={r.authorUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {r.author}
                    </a>
                  ) : (
                    <span>{r.author}</span>
                  )}
                  {r.when && <span>· {r.when}</span>}
                </figcaption>
              </figure>
            ))}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-sm underline"
            >
              {t("readReviewsOnGoogle")}
            </a>
            <p className="text-xs text-muted-foreground">
              {t("googleAttribution")}
            </p>
          </section>
        )}

        {/* Linked Organizer */}
        {organizer && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">{t("organizer")}</h2>
            <Link href={`/${organizer.slug}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  {organizer.logo_url ? (
                    <img
                      src={organizer.logo_url}
                      alt={organizer.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="text-lg font-semibold text-primary">
                        {organizer.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">
                        {organizer.name}
                      </span>
                      {organizer.is_verified && (
                        <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("viewOrganizerProfile")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
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

        {/* Tags / Features */}
        {venue.tags && venue.tags.length > 0 && (
          <section className="mb-8">
            <div className="flex flex-wrap gap-2">
              {venue.tags.map((tag: string, index: number) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/5 text-sm text-primary border border-primary/10"
                >
                  <Tag className="w-3 h-3" />
                  {localizedTags[index] !== tag
                    ? localizedTags[index]
                    : t.has(`tagLabels.${tag}`)
                      ? t(`tagLabels.${tag}`)
                      : tag.replace(/-/g, " ")}
                </span>
              ))}
            </div>
          </section>
        )}

        {JSON.stringify(localizedTags) !== JSON.stringify(venue.tags || []) && (
          <OriginalText text={(venue.tags || []).join(", ")} />
        )}

        {/* Happening now */}
        {happening_now.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              {t("happeningNow")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {happening_now.map((event) => (
                <Card
                  key={event.id}
                  className="hover:border-emerald-500/40 border-emerald-500/20 transition-colors overflow-hidden"
                >
                  <Link href={`/events/${event.slug}`} className="block">
                    <CardContent className="p-0">
                      {event.image_url && (
                        <img
                          src={event.image_url}
                          alt=""
                          className="w-full aspect-[2/1] object-cover"
                        />
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold mb-1">
                          {eventTitles.get(event.id)?.title || event.title}
                        </h3>
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">
                          {t("liveNow")}
                        </p>
                      </div>
                    </CardContent>
                  </Link>
                  {eventTitles.get(event.id)?.title &&
                    eventTitles.get(event.id)?.title !== event.title && (
                      <div className="px-4 pb-3">
                        <OriginalText text={event.title} />
                      </div>
                    )}
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming events */}
        {upcoming_events.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">
              {t("upcomingEvents")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {upcoming_events.map((event) => (
                <Card
                  key={event.id}
                  className="hover:border-primary/50 transition-colors overflow-hidden"
                >
                  <Link href={`/events/${event.slug}`} className="block">
                    <CardContent className="p-0">
                      {event.image_url && (
                        <img
                          src={event.image_url}
                          alt=""
                          className="w-full aspect-[2/1] object-cover"
                        />
                      )}
                      <div className="p-4">
                        <h3 className="font-semibold mb-2">
                          {eventTitles.get(event.id)?.title || event.title}
                        </h3>
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {formatEventDate(event.starts_at)}
                        </span>
                      </div>
                    </CardContent>
                  </Link>
                  {eventTitles.get(event.id)?.title &&
                    eventTitles.get(event.id)?.title !== event.title && (
                      <div className="px-4 pb-3">
                        <OriginalText text={event.title} />
                      </div>
                    )}
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Past Events */}
        <PastEventsSection
          events={pastEvents}
          locale={locale as Locale}
          label={t("pastEvents")}
        />

        {/* Gallery Section */}
        {canManageVenue ? (
          <section className="mb-8 pt-2">
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
              <Camera className="w-5 h-5" />
              {t("photos")}
            </h2>
            {canManageVenue ? (
              <VenuePhotoManager
                venueId={venue.id}
                photos={venue.photos || []}
              />
            ) : (
              venue.photos &&
              venue.photos.length > 0 && <PhotoGallery photos={venue.photos} />
            )}
          </section>
        ) : null}

        {/* Community Photos Section */}
        <ExperienceList venueId={venue.id} />
        <VenueCommunityPhotos venueId={venue.id} locale={locale} />

        {/* Hours Section */}
        {venue.operating_hours && (
          <section className="mb-8 pt-2">
            <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t("hours")}
            </h2>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="grid gap-2">
                {daysOfWeek.map((day) => {
                  const hours = venue.operating_hours?.[day];
                  const today = new Date();
                  const daLatTime = new Date(
                    today.getTime() + 7 * 60 * 60 * 1000,
                  );
                  const currentDay = [
                    "sunday",
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                  ][daLatTime.getUTCDay()];
                  const isToday = currentDay === day;

                  return (
                    <div
                      key={day}
                      className={`flex justify-between items-center py-1 px-2 rounded ${
                        isToday ? "bg-primary/10 font-medium" : ""
                      }`}
                    >
                      <span
                        className={
                          isToday ? "text-primary" : "text-muted-foreground"
                        }
                      >
                        {dayLabels[day]}
                        {isToday && ` (${t("hoursToday")})`}
                      </span>
                      <span
                        className={
                          hours === "closed" || !hours
                            ? "text-muted-foreground"
                            : ""
                        }
                      >
                        {hours === "closed" || !hours
                          ? t("closedNow")
                          : `${hours.open} - ${hours.close}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Location Map Section */}
        {venue.latitude && venue.longitude && (
          <section className="mb-8 pt-2">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              {t("location")}
            </h2>
            <VenueMap
              latitude={venue.latitude}
              longitude={venue.longitude}
              name={venue.name}
              address={translatedAddress}
              directionsLabel={t("getDirections")}
              viewOnMapLabel={t("viewOnMap")}
              locale={locale}
            />
          </section>
        )}

        {/* Activity stats */}
        {past_events_count > 0 && (
          <section className="mb-8">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <Link
                href={getVenuePastEventsPath(venue.slug)}
                className="hover:text-foreground hover:underline transition-colors"
              >
                {past_events_count} {t("pastEvents").toLowerCase()}
              </Link>
            </div>
          </section>
        )}

        {/* Venue Homepage CTA — for venues that want to link their domain here */}
        <section className="mb-8 mt-4">
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-6 text-center">
              <h2 className="text-lg font-semibold mb-2">
                {t("visitVenue", { name: venue.name })}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {venue.address && (
                  <VenueCopyAddress
                    address={translatedAddress || venue.address}
                    copiedLabel={t("addressCopied")}
                  />
                )}
                {t("findUsDescription")}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <VenueShareButton
                  name={venue.name}
                  shareText={t("shareVenueText", {
                    name: venue.name,
                    address: translatedAddress || venue.address || "",
                  })}
                  url={`https://dalat.app${localeUrl(locale as Locale, `/${venue.slug}`)}`}
                  label={t("shareVenue")}
                />
                {venue.website_url && (
                  <a
                    href={venue.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted active:scale-95 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {t("visitWebsite")}
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Explore more venues of the same type */}
        {venue.venue_type && (
          <nav
            className="mb-8 pt-4 border-t"
            aria-label="Explore similar venues"
          >
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {t("exploreMore")}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/${venue.venue_type === "cafe" ? "cafes" : venue.venue_type === "bar" ? "bars" : venue.venue_type === "restaurant" ? "restaurants" : venue.venue_type === "gallery" ? "galleries" : venue.venue_type === "park" ? "parks" : venue.venue_type === "hotel" ? "hotels" : venue.venue_type === "homestay" ? "homestays" : venue.venue_type}`}
                className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors"
              >
                {t("allOfType", { type: typeConfig?.label || "" })}
              </Link>
              <Link
                href="/discover"
                className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors"
              >
                {t("discoverDaLat")}
              </Link>
              <Link
                href="/blog/venues"
                className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors inline-flex items-center gap-1"
              >
                <BookOpen className="w-3 h-3" />
                {t("venueGuides")}
              </Link>
            </div>
          </nav>
        )}
      </div>
    </>
  );
}
