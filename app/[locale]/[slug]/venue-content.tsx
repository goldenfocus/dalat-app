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
import { EventHighlights } from "@/components/venues/event-highlights";
import { getVenueHighlightPhotos } from "@/lib/venues/highlights-server";
import { OfficialVenueLinks } from "@/components/venues/official-links";
import { TikTokIcon } from "@/components/venues/tiktok-icon";
import { safeVenueUrl, splitVenueLinks } from "@/lib/venues/social-links";
import { venueEditor } from "@/lib/venues/access";
import { VenuePhotoManager } from "@/components/venues/venue-photo-manager";
import { VenueShareButton } from "@/components/venues/venue-share-button";
import { VenueCopyAddress } from "@/components/venues/venue-copy-address";
import { JsonLd, generateVenuePageSchema } from "@/lib/structured-data";
import { getVenuePastEventsPath } from "@/lib/venues/routes";
import { getLocationMapLinks } from "@/lib/events/location";
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
    series_id: string | null;
    series_slug: string | null;
    rrule: string | null;
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

  // Deduplicate before limiting so other activities are not hidden by one series.
  const { data: upcomingEvents } = await supabase.rpc("get_venue_upcoming_events", { p_venue_id: venueId });

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
    .eq("has_private_details", false)
    .lt("starts_at", nowISO)
    .or(`ends_at.lt.${nowISO},and(ends_at.is.null,starts_at.lt.${fourHoursAgo})`);

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
  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 3600000).toISOString();
  const { data } = await supabase
    .from("events")
    .select("id, slug, title, image_url, starts_at, ends_at")
    .eq("venue_id", venueId)
    .eq("status", "published")
    .eq("has_private_details", false)
    .lt("starts_at", now.toISOString())
    .or(`ends_at.lt.${now.toISOString()},and(ends_at.is.null,starts_at.lt.${fourHoursAgo})`)
    .order("starts_at", { ascending: false })
    .limit(12);

  return data || [];
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
  const [pastEvents, editor, highlightPhotos] = await Promise.all([
    getPastEvents(venue.id),
    venueEditor(venue.id),
    getVenueHighlightPhotos(venue.id).catch(error => { console.error("Venue highlights", error); return []; }),
  ]);
  const canManageVenue = !!editor;
  const tHighlights = await getTranslations("venueHighlights");

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
    [...upcoming_events, ...happening_now, ...pastEvents].map((event) => event.id),
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
  const coverPhoto = localizedPhotos.find((photo) => photo.url === venue.cover_photo_url);
  const originalCoverPhoto = venue.photos?.find((photo) => photo.url === venue.cover_photo_url);
  const gallery: VenueGalleryPhoto[] = [
    ...(venue.cover_photo_url
      ? [
          {
            id: "cover",
            src: venue.cover_photo_url,
            thumb: venue.cover_photo_url,
            alt: coverPhoto?.caption || venue.name,
            caption: coverPhoto?.caption,
            originalCaption: originalCoverPhoto?.caption,
            credit: coverPhoto?.credit,
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
        credit: p.credit,
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
  const hero = gallery[0];
  const { website, tiktok } = splitVenueLinks(venue.website_url, venue.tiktok_url);
  const facebook = safeVenueUrl(venue.facebook_url)?.href;
  const instagram = safeVenueUrl(venue.instagram_url)?.href;
  const socialClass = "inline-flex min-h-11 items-center gap-2 rounded-full border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted";
  const approximateLocation = venue.geocode_source === "osm_street";
  const preciseDirections = venue.geocode_source === "google_maps_link"
    ? getLocationMapLinks(venue).directions
    : null;
  const directionsUrl = (approximateLocation && venue.google_maps_url) || preciseDirections
    || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
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
  const ownImages = gallery.filter((g) => !g.googleAuthors).map((g) => g.src);
  const isUnclaimed = !venue.owner_id;
  const typeConfig = venue.venue_type
    ? getVenueTypeConfig(venue.venue_type)
    : null;
  const TypeIcon = typeConfig?.icon;
  const localBusinessSchema = generateVenuePageSchema(
    { ...venue, description: translatedDescription },
    locale,
    {
      images: ownImages,
      mapsUrl,
      ...(menu.length > 0 && { menuUrl }),
      venuesLabel: t("title"),
    },
  );

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

      <nav
        aria-label={t("title")}
        className="mx-auto mb-4 flex w-[calc(100%_-_2rem)] max-w-5xl flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <Link href="/venues" className="hover:underline">
          {t("title")}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{venue.name}</span>
      </nav>

      <section className={`mx-auto mb-8 grid w-[calc(100%_-_2rem)] max-w-5xl overflow-hidden rounded-3xl border bg-card shadow-sm ${hero ? "md:grid-cols-2" : ""}`}>
        {hero && <VenueGallery photos={gallery} venueName={venue.name} hero />}

        <div className={`min-w-0 px-5 py-6 sm:px-8 sm:py-8 ${hero ? "md:py-12" : ""}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {typeConfig && TypeIcon && venue.venue_type && (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <TypeIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t(`types.${venue.venue_type}`)}
                </span>
              )}
              {venue.operating_hours && <VenueHoursBadge operatingHours={venue.operating_hours} />}
              {venue.price_range && <span>{venue.price_range}</span>}
            </div>
            <VenueShareButton url={localeUrl(locale as Locale, `/${venue.slug}`)} label={t("shareVenue")} compact />
          </div>
          <div className="flex items-center gap-3">
            {venue.logo_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={venue.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-xl border bg-background object-contain sm:h-14 sm:w-14" />
            )}
            <h1 className="min-w-0 text-balance text-3xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-4xl lg:text-5xl">
              {venue.name}
            </h1>
          </div>
          {venue.is_verified && (
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t("verified")}
            </span>
          )}
          {rating && <div className="mt-2">{rating}</div>}

          {translatedAddress && (
            <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {translatedAddress}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2" data-venue-contact-actions>
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
              <Navigation className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("directionsGoogle")}
            </a>
            {venue.phone && (
              <PhoneActionButton phone={venue.phone} zaloUrl={venue.zalo_url} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background transition-colors hover:bg-muted" />
            )}
            {venue.email && (
              <a href={`mailto:${venue.email}`} aria-label="Email" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background transition-colors hover:bg-muted">
                <Mail className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </div>
          {(facebook || instagram || tiktok) && (
            <div className="mt-3 flex flex-wrap items-center gap-2" data-venue-contact-icons>
              {facebook && (
                <a href={facebook} target="_blank" rel="noopener noreferrer" className={socialClass}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Facebook
                </a>
              )}
              {instagram && (
                <a href={instagram} target="_blank" rel="noopener noreferrer" className={socialClass}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
                  </svg>
                  Instagram
                </a>
              )}
              {tiktok && (
                <a href={tiktok.profile || tiktok.href} target="_blank" rel="noopener noreferrer" className={socialClass}>
                  <TikTokIcon className="h-4 w-4" />
                  TikTok
                </a>
              )}
            </div>
          )}
          {(website || venue.menu_url) && (
            <div className="mt-3">
              <OfficialVenueLinks website={website} menu={venue.menu_url} name={venue.name} websiteLabel={t("visitWebsite")} />
            </div>
          )}
        </div>
      </section>

      <div className="container max-w-4xl mx-auto px-4">
        {gallery.length > 1 && <VenueGallery photos={gallery} venueName={venue.name} skipCover />}

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
          <section id="upcoming-events" className="mb-8 scroll-mt-24">
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
                        {event.rrule && <p className="mt-2 text-sm font-medium text-primary">{
                          /(?:^|;)FREQ=WEEKLY(?:;|$)/.test(event.rrule) && !/(?:^|;)INTERVAL=(?:[2-9]|\d{2,})(?:;|$)/.test(event.rrule)
                            && !/(?:^|;)BYDAY=[^;]*,/.test(event.rrule)
                            ? tHighlights("weekly", { day: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(event.starts_at)) })
                            : tHighlights("recurring")
                        }</p>}
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

        <EventHighlights venueId={venue.id} photos={highlightPhotos}
          selectedIds={venue.highlight_moment_ids || []} canManage={canManageVenue} />

        {/* Past Events */}
        <PastEventsSection
          events={pastEvents.map(event => ({ ...event, original_title: event.title, title: eventTitles.get(event.id)?.title || event.title }))}
          locale={locale as Locale}
          label={t("pastEvents")}
          totalCount={past_events_count}
          allEventsHref={getVenuePastEventsPath(venue.slug)}
        />

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

              </div>
            </div>
            <details className="group rounded-xl border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{tMenu("viewFullMenu")}</summary>
              <div className="p-4"><MenuSections sections={menu} locale={locale} showNav={false} /></div>
            </details>
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-muted text-sm"
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
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-pill bg-primary/5 text-sm text-primary border border-primary/10"
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
              googleMapsUrl={venue.google_maps_url}
              approximate={approximateLocation}
              directionsLabel={t("getDirections")}
              viewOnMapLabel={t("viewOnMap")}
            />
            {venue.geocode_source === "osm_event_venue" && (
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"
                className="mt-2 inline-block text-xs text-muted-foreground underline">
                © OpenStreetMap contributors
              </a>
            )}
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
                  url={localeUrl(locale as Locale, `/${venue.slug}`)}
                  label={t("shareVenue")}
                />
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t("openInGoogleMaps")}
                </a>
              </div>
            </CardContent>
          </Card>
        </section>

        {isUnclaimed && !venue.is_verified ? (
          <Link href={`/venues/${venue.slug}/claim`} className="mb-8 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors hover:bg-muted">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            {t("claimVenue")}
          </Link>
        ) : canManageVenue ? (
          <Link href={`/venues/${venue.slug}/edit`} className="mb-8 inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors hover:bg-muted">
            {t("editVenuePage")}
          </Link>
        ) : null}

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
                className="text-sm px-3 py-1.5 rounded-pill border hover:bg-muted transition-colors"
              >
                {t("allOfType", { type: typeConfig?.label || "" })}
              </Link>
              <Link
                href="/discover"
                className="text-sm px-3 py-1.5 rounded-pill border hover:bg-muted transition-colors"
              >
                {t("discoverDaLat")}
              </Link>
              <Link
                href="/blog/venues"
                className="text-sm px-3 py-1.5 rounded-pill border hover:bg-muted transition-colors inline-flex items-center gap-1"
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
