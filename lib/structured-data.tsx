/**
 * JSON-LD Structured Data Utilities for dalat.app
 *
 * Implements Schema.org structured data for:
 * - SEO: Rich results in Google, Bing, etc.
 * - AEO: AI assistants can extract structured event data
 *
 * Reference: https://schema.org
 */

import type {
  Event,
  Profile,
  Organizer,
  Festival,
  EventSeries,
  Moment,
  Venue,
  VenueType,
} from "@/lib/types";
import type { BlogPostFull } from "@/lib/types/blog";

const SITE_URL = "https://dalat.app";
const SITE_NAME = "ĐàLạt.app";
const PUBLISHER_LOGO_URL = `${SITE_URL}/android-chrome-512x512.png`;

/** Build schema URLs that match localePrefix: "as-needed" canonicals. */
function localizedSiteUrl(locale: string, path = ""): string {
  const normalizedPath = path && !path.startsWith("/") ? `/${path}` : path;
  return locale === "en"
    ? `${SITE_URL}${normalizedPath}`
    : `${SITE_URL}/${locale}${normalizedPath}`;
}

// Đà Lạt, Vietnam coordinates
const DA_LAT_GEO = {
  latitude: 11.9404,
  longitude: 108.4583,
};

/**
 * React component to render JSON-LD script tag
 *
 * Escape HTML-significant characters after JSON serialization. JSON.stringify
 * alone leaves `</script>` intact, and event fields contain user-authored text.
 * Unicode escapes preserve the parsed JSON value while preventing the HTML
 * parser from terminating the script element.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/metadata#json-ld
 */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function JsonLd({ data }: { data: object | object[] }) {
  const jsonLdArray = Array.isArray(data) ? data : [data];

  return (
    <>
      {jsonLdArray.map((item, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(item) }}
        />
      ))}
    </>
  );
}

function getSchemaEventStatus(status: string): string {
  if (status === "cancelled") return "https://schema.org/EventCancelled";
  if (status === "postponed") return "https://schema.org/EventPostponed";
  return "https://schema.org/EventScheduled";
}

/**
 * Generate Event schema for event pages
 * https://schema.org/Event
 */
export function generateEventSchema(
  event: Omit<Event, "event_series"> & {
    profiles?: Profile;
    organizers?: Organizer | null;
    event_series?: Pick<EventSeries, "slug" | "title"> | null;
  },
  locale: string,
  attendeeCount?: number,
  imageMetadata?: { alt?: string | null; description?: string | null },
  localizedContent?: { title?: string | null; description?: string | null },
) {
  const eventUrl = localizedSiteUrl(locale, `/events/${event.slug}`);
  const offerUrl =
    event.source_platform === "activity-graph" && event.external_chat_url
      ? event.external_chat_url
      : eventUrl;
  const localizedTitle = localizedContent?.title?.trim() || event.title;
  const localizedDescription =
    localizedContent?.description?.trim() ||
    (localizedContent === undefined ? event.description?.trim() : undefined);

  // A date in the past does not mean an event was postponed. Only explicit
  // lifecycle/exception state may change schema status; completed event pages
  // otherwise remain scheduled evergreen archives.
  const storedStatus = event.status as string;
  const eventStatus =
    storedStatus === "cancelled" || event.exception_type === "cancelled"
      ? "https://schema.org/EventCancelled"
      : event.exception_type === "rescheduled"
        ? "https://schema.org/EventRescheduled"
        : storedStatus === "postponed"
          ? "https://schema.org/EventPostponed"
          : "https://schema.org/EventScheduled";

  const hasCoordinates =
    Number.isFinite(event.latitude) && Number.isFinite(event.longitude);
  const offerAvailability =
    event.capacity && attendeeCount !== undefined
      ? attendeeCount >= event.capacity
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock"
      : undefined;

  let offers: Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (eventStatus !== "https://schema.org/EventCancelled") {
    if (event.price_type === "free") {
      offers = {
        "@type": "Offer",
        price: 0,
        priceCurrency: "VND",
        ...(offerAvailability && { availability: offerAvailability }),
        url: offerUrl,
      };
    } else if (
      (event.price_type === "paid" || event.price_type === "donation") &&
      event.ticket_tiers?.length
    ) {
      const truthfulTiers = event.ticket_tiers.filter(
        (tier) =>
          tier.name.trim().length > 0 &&
          Number.isFinite(tier.price) &&
          tier.price >= 0 &&
          tier.currency.trim().length > 0,
      );
      if (truthfulTiers.length > 0) {
        offers = truthfulTiers.map((tier) => ({
          "@type": "Offer",
          name: tier.name,
          price: tier.price,
          priceCurrency: tier.currency.toUpperCase(),
          ...(offerAvailability && { availability: offerAvailability }),
          url: offerUrl,
          ...(tier.description?.trim() && {
            description: tier.description.trim(),
          }),
        }));
      }
    }
  }

  // `online_link` is RSVP-gated in the visible page. Never leak a private
  // meeting URL through public JSON-LD. A real physical venue still makes an
  // online-capable event mixed; do not suppress truthful public place data.
  const hasPhysicalLocation = Boolean(
    event.location_name || event.address || hasCoordinates,
  );
  const location = hasPhysicalLocation
    ? {
        "@type": "Place",
        ...(event.location_name && { name: event.location_name }),
        ...(event.address && {
          address: {
            "@type": "PostalAddress",
            streetAddress: event.address,
            addressLocality: "Đà Lạt",
            addressRegion: "Lâm Đồng",
            addressCountry: "VN",
          },
        }),
        ...(hasCoordinates && {
          geo: {
            "@type": "GeoCoordinates",
            latitude: event.latitude,
            longitude: event.longitude,
          },
        }),
        ...(event.google_maps_url && { hasMap: event.google_maps_url }),
      }
    : undefined;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: localizedTitle,
    ...(localizedDescription && { description: localizedDescription }),
    url: eventUrl,
    startDate: event.starts_at,
    ...(event.ends_at && { endDate: event.ends_at }),
    eventStatus,
    eventAttendanceMode: event.is_online
      ? hasPhysicalLocation
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    ...(location && { location }),

    // Image - with structured metadata for AI search engines
    ...(event.image_url && {
      image:
        imageMetadata?.alt || imageMetadata?.description
          ? {
              "@type": "ImageObject",
              url: event.image_url,
              ...(imageMetadata.alt && { name: imageMetadata.alt }),
              ...(imageMetadata.description && {
                description: imageMetadata.description,
              }),
            }
          : [event.image_url],
    }),

    // Organizer - use Organizer if available, otherwise fall back to creator profile
    organizer: event.organizers
      ? {
          "@type": "Organization",
          name: event.organizers.name,
          url: localizedSiteUrl(locale, `/${event.organizers.slug}`),
          ...(event.organizers.logo_url && { logo: event.organizers.logo_url }),
        }
      : event.profiles
        ? {
            "@type": "Person",
            name:
              event.profiles.display_name ||
              event.profiles.username ||
              "Event Organizer",
            // Use username if available, otherwise fall back to user ID for URL
            url: localizedSiteUrl(
              locale,
              `/${event.profiles.username || event.profiles.id}`,
            ),
          }
        : undefined,

    ...(offers && { offers }),

    // Link generated occurrences back to their recurring activity page.
    ...(event.event_series && {
      superEvent: {
        "@type": "EventSeries",
        name: event.event_series.title,
        url: localizedSiteUrl(locale, `/series/${event.event_series.slug}`),
      },
    }),

    // Attendance info
    ...(event.capacity && { maximumAttendeeCapacity: event.capacity }),
    ...(event.capacity &&
      attendeeCount !== undefined && {
        remainingAttendeeCapacity: Math.max(0, event.capacity - attendeeCount),
      }),

    // In language
    inLanguage: locale,
  };

  return schema;
}

/**
 * Generate Organization schema for organizer pages
 * https://schema.org/Organization
 */
export function generateOrganizationSchema(
  organizer: Organizer,
  locale: string,
  eventCount?: number,
) {
  const organizerUrl = localizedSiteUrl(
    locale,
    `/organizers/${organizer.slug}`,
  );

  // Map organizer types to Schema.org types
  const schemaType =
    organizer.organizer_type === "venue"
      ? "LocalBusiness"
      : organizer.organizer_type === "business"
        ? "LocalBusiness"
        : "Organization";

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: organizer.name,
    url: organizerUrl,
    ...(organizer.description && { description: organizer.description }),
    ...(organizer.logo_url && { logo: organizer.logo_url }),
    ...(organizer.logo_url && { image: organizer.logo_url }),

    // Contact info
    ...(organizer.contact_email && { email: organizer.contact_email }),
    ...(organizer.contact_phone && { telephone: organizer.contact_phone }),

    // Social links
    sameAs: [
      organizer.website_url,
      organizer.facebook_url,
      organizer.instagram_url,
    ].filter(Boolean),

    // Location (Đà Lạt)
    address: {
      "@type": "PostalAddress",
      addressLocality: "Đà Lạt",
      addressRegion: "Lam Dong",
      addressCountry: "VN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: DA_LAT_GEO.latitude,
      longitude: DA_LAT_GEO.longitude,
    },

    // Events organized
    ...(eventCount !== undefined &&
      eventCount > 0 && {
        event: {
          "@type": "ItemList",
          numberOfItems: eventCount,
          itemListElement: `${organizerUrl}#events`,
        },
      }),
  };

  return schema;
}

/**
 * Map venue types to Schema.org LocalBusiness subtypes
 */
const VENUE_TYPE_SCHEMA_MAP: Record<VenueType, string> = {
  cafe: "CafeOrCoffeeShop",
  bar: "BarOrPub",
  restaurant: "Restaurant",
  gallery: "ArtGallery",
  park: "Park",
  hotel: "Hotel",
  coworking: "LocalBusiness",
  community_center: "CivicStructure",
  outdoor: "TouristAttraction",
  homestay: "LodgingBusiness",
  hiking: "TouristAttraction",
  vegetarian: "Restaurant",
  vegan: "Restaurant",
  other: "LocalBusiness",
};

/**
 * Generate LocalBusiness schema for venue pages
 * https://schema.org/LocalBusiness
 */
export function generateLocalBusinessSchema(
  venue: Venue,
  locale: string,
  eventCount?: number,
) {
  const venueUrl = localizedSiteUrl(locale, `/venues/${venue.slug}`);
  const schemaType = venue.venue_type
    ? VENUE_TYPE_SCHEMA_MAP[venue.venue_type]
    : "LocalBusiness";

  // Format opening hours for Schema.org
  const openingHoursSpec = venue.operating_hours
    ? Object.entries(venue.operating_hours)
        .filter(([, hours]) => hours !== "closed" && hours)
        .map(([day, hours]) => {
          if (hours === "closed" || !hours) return null;
          const dayMap: Record<string, string> = {
            monday: "Monday",
            tuesday: "Tuesday",
            wednesday: "Wednesday",
            thursday: "Thursday",
            friday: "Friday",
            saturday: "Saturday",
            sunday: "Sunday",
          };
          return {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: dayMap[day],
            opens: (hours as { open: string; close: string }).open,
            closes: (hours as { open: string; close: string }).close,
          };
        })
        .filter(Boolean)
    : undefined;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: venue.name,
    url: venueUrl,
    ...(venue.description && { description: venue.description }),
    ...(venue.logo_url && { logo: venue.logo_url }),
    ...(venue.cover_photo_url && { image: venue.cover_photo_url }),

    // Location with precise coordinates
    address: {
      "@type": "PostalAddress",
      ...(venue.address && { streetAddress: venue.address }),
      addressLocality: "Đà Lạt",
      addressRegion: "Lam Dong",
      addressCountry: "VN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: venue.latitude,
      longitude: venue.longitude,
    },

    // Contact info
    ...(venue.email && { email: venue.email }),
    ...(venue.phone && { telephone: venue.phone }),

    // Social links
    sameAs: [venue.website_url, venue.facebook_url, venue.instagram_url].filter(
      Boolean,
    ),

    // Opening hours
    ...(openingHoursSpec &&
      openingHoursSpec.length > 0 && {
        openingHoursSpecification: openingHoursSpec,
      }),

    // Price range
    ...(venue.price_range && { priceRange: venue.price_range }),

    // Amenities as features
    ...(venue.has_wifi && {
      amenityFeature: {
        "@type": "LocationFeatureSpecification",
        name: "WiFi",
        value: true,
      },
    }),

    // Events at this venue
    ...(eventCount !== undefined &&
      eventCount > 0 && {
        event: {
          "@type": "ItemList",
          numberOfItems: eventCount,
          itemListElement: `${venueUrl}#events`,
        },
      }),

    // Google Maps
    ...(venue.google_maps_url && { hasMap: venue.google_maps_url }),
  };

  return schema;
}

/**
 * Generate Festival schema for festival pages
 * https://schema.org/Festival (subset of Event)
 */
export function generateFestivalSchema(
  festival: Festival,
  locale: string,
  eventCount?: number,
) {
  const festivalUrl = localizedSiteUrl(locale, `/festivals/${festival.slug}`);

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Festival",
    name: festival.title,
    ...(festival.subtitle && { alternateName: festival.subtitle }),
    description:
      festival.description || `${festival.title} - Festival in Đà Lạt, Vietnam`,
    url: festivalUrl,
    startDate: festival.start_date,
    endDate: festival.end_date,
    eventStatus:
      festival.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",

    // Images
    ...(festival.cover_image_url && {
      image: [festival.cover_image_url, festival.logo_url].filter(Boolean),
    }),

    // Location
    location: {
      "@type": "Place",
      name: festival.location_city || "Đà Lạt",
      ...(festival.location_description && {
        description: festival.location_description,
      }),
      address: {
        "@type": "PostalAddress",
        addressLocality: festival.location_city || "Đà Lạt",
        addressRegion: "Lam Dong",
        addressCountry: "VN",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: DA_LAT_GEO.latitude,
        longitude: DA_LAT_GEO.longitude,
      },
    },

    // External links
    sameAs: [festival.website_url, festival.facebook_url].filter(Boolean),

    // Sub-events count
    ...(eventCount !== undefined &&
      eventCount > 0 && {
        subEvent: {
          "@type": "ItemList",
          numberOfItems: eventCount,
        },
      }),

    // Free event
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "VND",
      availability: "https://schema.org/InStock",
    },

    inLanguage: locale,
  };

  return schema;
}

/**
 * Generate Person schema for user profile pages
 * https://schema.org/Person
 */
export function generatePersonSchema(
  profile: Profile,
  locale: string,
  eventCount?: number,
) {
  // Use username if available, otherwise fall back to user ID for URL
  const profileIdentifier = profile.username || profile.id;
  const profileUrl = localizedSiteUrl(locale, `/${profileIdentifier}`);

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.display_name || profile.username || "User",
    url: profileUrl,
    ...(profile.bio && { description: profile.bio }),
    ...(profile.avatar_url && { image: profile.avatar_url }),

    // Location
    homeLocation: {
      "@type": "Place",
      name: "Đà Lạt, Vietnam",
      geo: {
        "@type": "GeoCoordinates",
        latitude: DA_LAT_GEO.latitude,
        longitude: DA_LAT_GEO.longitude,
      },
    },

    // Events
    ...(eventCount !== undefined &&
      eventCount > 0 && {
        organizedEvent: {
          "@type": "ItemList",
          numberOfItems: eventCount,
        },
      }),
  };

  return schema;
}

/**
 * Generate EventSeries schema for recurring events
 * https://schema.org/EventSeries
 */
export function generateEventSeriesSchema(
  series: EventSeries & { organizers?: Organizer | null },
  locale: string,
  upcomingEvents: Array<
    Pick<Event, "slug" | "starts_at" | "ends_at" | "status" | "image_url">
  > = [],
) {
  const seriesUrl = localizedSiteUrl(locale, `/series/${series.slug}`);
  const seriesId = `${seriesUrl}#series`;
  const hasCoordinates =
    typeof series.latitude === "number" &&
    Number.isFinite(series.latitude) &&
    typeof series.longitude === "number" &&
    Number.isFinite(series.longitude);
  const hasPhysicalLocation = Boolean(
    series.location_name ||
    series.address ||
    series.google_maps_url ||
    hasCoordinates,
  );
  const eventAttendanceMode = series.is_online
    ? hasPhysicalLocation
      ? "https://schema.org/MixedEventAttendanceMode"
      : "https://schema.org/OnlineEventAttendanceMode"
    : "https://schema.org/OfflineEventAttendanceMode";
  const offerUrl =
    series.source_platform === "activity-graph" && series.external_chat_url
      ? series.external_chat_url
      : seriesUrl;
  const offerBase = {
    "@type": "Offer",
    url: offerUrl,
    availability: "https://schema.org/InStock",
  };
  const offers =
    series.price_type === "free"
      ? { ...offerBase, price: 0, priceCurrency: "VND" }
      : series.ticket_tiers?.length
        ? series.ticket_tiers.map((tier) => ({
            ...offerBase,
            name: tier.name,
            price: tier.price,
            priceCurrency: tier.currency,
            ...(tier.description && { description: tier.description }),
          }))
        : undefined;
  const location = hasPhysicalLocation
    ? {
        "@type": "Place",
        name: series.location_name || "Đà Lạt, Vietnam",
        ...(series.address && {
          address: {
            "@type": "PostalAddress",
            streetAddress: series.address,
            addressLocality: "Đà Lạt",
            addressRegion: "Lam Dong",
            addressCountry: "VN",
          },
        }),
        ...(hasCoordinates && {
          geo: {
            "@type": "GeoCoordinates",
            latitude: series.latitude,
            longitude: series.longitude,
          },
        }),
        ...(series.google_maps_url && { hasMap: series.google_maps_url }),
      }
    : undefined;
  const rruleParts: Record<string, string> = Object.fromEntries(
    series.rrule
      .split(";")
      .map((part) => part.split("=", 2))
      .filter(([key, value]) => Boolean(key && value)),
  );
  const interval = Math.max(1, Number.parseInt(rruleParts.INTERVAL || "1", 10));
  const repeatFrequencyUnit: Record<string, string> = {
    DAILY: "D",
    WEEKLY: "W",
    MONTHLY: "M",
    YEARLY: "Y",
  };
  const repeatUnit = repeatFrequencyUnit[rruleParts.FREQ];
  const weekdayNames: Record<string, string> = {
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
    SU: "Sunday",
  };
  const byDayValues = (rruleParts.BYDAY || "")
    .split(",")
    .map((value) => {
      const match = value.match(/^(-?\d+)?([A-Z]{2})$/);
      if (!match || !weekdayNames[match[2]]) return null;
      return match[1] ? value : `https://schema.org/${weekdayNames[match[2]]}`;
    })
    .filter((value): value is string => Boolean(value));
  const repeatCount = Number.parseInt(
    String(series.rrule_count ?? rruleParts.COUNT ?? ""),
    10,
  );
  const byMonthDay = Number.parseInt(rruleParts.BYMONTHDAY || "", 10);
  const eventSchedule = repeatUnit
    ? {
        "@type": "Schedule",
        startDate: series.first_occurrence,
        startTime: series.starts_at_time,
        duration: `PT${series.duration_minutes}M`,
        scheduleTimezone: series.timezone,
        repeatFrequency: `P${Number.isFinite(interval) ? interval : 1}${repeatUnit}`,
        ...(series.rrule_until && { endDate: series.rrule_until }),
        ...(Number.isFinite(repeatCount) && repeatCount > 0
          ? { repeatCount }
          : {}),
        ...(byDayValues.length > 0 && { byDay: byDayValues }),
        ...(Number.isFinite(byMonthDay) && { byMonthDay }),
      }
    : undefined;
  const subEvents = upcomingEvents.map((event) => {
    const eventUrl = localizedSiteUrl(locale, `/events/${event.slug}`);
    return {
      "@type": "Event",
      "@id": `${eventUrl}#event`,
      name: series.title,
      url: eventUrl,
      startDate: event.starts_at,
      ...(event.ends_at && { endDate: event.ends_at }),
      eventStatus: getSchemaEventStatus(event.status),
      eventAttendanceMode,
      ...(location && { location }),
      ...((event.image_url || series.image_url) && {
        image: [event.image_url || series.image_url],
      }),
      superEvent: { "@id": seriesId },
    };
  });

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    "@id": seriesId,
    name: series.title,
    description:
      series.description || `Recurring event series in Đà Lạt, Vietnam`,
    url: seriesUrl,
    ...(!eventSchedule && {
      startDate: series.first_occurrence,
      ...(series.rrule_until && { endDate: series.rrule_until }),
    }),
    eventStatus:
      series.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode,

    // Location
    ...(location && { location }),

    ...(eventSchedule && { eventSchedule }),

    // Image
    ...(series.image_url && { image: [series.image_url] }),

    // Organizer
    ...(series.organizers && {
      organizer: {
        "@type": "Organization",
        name: series.organizers.name,
        url: localizedSiteUrl(locale, `/organizers/${series.organizers.slug}`),
      },
    }),

    // Sub-events
    ...(subEvents.length > 0 && { subEvent: subEvents }),

    ...(series.price_type === "free" && { isAccessibleForFree: true }),
    ...(series.price_type === "paid" && { isAccessibleForFree: false }),
    ...(offers && { offers }),

    inLanguage: locale,
  };

  return schema;
}

/**
 * Generate SocialMediaPosting schema for moment pages
 * https://schema.org/SocialMediaPosting
 */
export function generateMomentSchema(
  moment: Moment & { profiles?: Profile; events?: Event },
  locale: string,
) {
  const momentUrl = localizedSiteUrl(locale, `/moments/${moment.id}`);
  const userName =
    moment.profiles?.display_name || moment.profiles?.username || "Someone";
  const userIdentifier = moment.profiles?.username || moment.user_id;
  const eventTitle = moment.events?.title || "Event";
  const eventSlug = moment.events?.slug || "";

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    headline: `${userName}'s moment at ${eventTitle}`,
    url: momentUrl,
    datePublished: moment.created_at,
    author: {
      "@type": "Person",
      name: userName,
      url: localizedSiteUrl(locale, `/${userIdentifier}`),
    },
    about: eventSlug
      ? {
          "@type": "Event",
          name: eventTitle,
          url: localizedSiteUrl(locale, `/events/${eventSlug}`),
        }
      : {
          "@type": "Event",
          name: eventTitle,
        },
    contentLocation: {
      "@type": "Place",
      name: "Đà Lạt, Vietnam",
      geo: {
        "@type": "GeoCoordinates",
        latitude: DA_LAT_GEO.latitude,
        longitude: DA_LAT_GEO.longitude,
      },
    },
    ...(moment.text_content && { articleBody: moment.text_content }),
  };

  if (moment.media_url && moment.content_type === "photo") {
    schema.image = [moment.media_url];
  }

  if (moment.media_url && moment.content_type === "video") {
    schema.video = {
      "@type": "VideoObject",
      contentUrl: moment.media_url,
      uploadDate: moment.created_at,
      name: `${userName}'s moment at ${eventTitle}`,
    };
  }

  return schema;
}

/**
 * Generate ItemList schema for the global moments discovery page
 * https://schema.org/ItemList
 */
export function generateMomentsDiscoverySchema(
  moments: Array<Pick<Moment, "id">>,
  locale: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Moments",
    itemListElement: moments.map((moment, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: localizedSiteUrl(locale, `/moments/${moment.id}`),
    })),
  };
}

/**
 * Generate ImageGallery + VideoGallery schema for event moments / cinema mode
 * Optimized for AI search engines (AEO) — provides rich context about
 * the photo/video album, contributors, and event association.
 * https://schema.org/ImageGallery
 */
export function generateCinemaAlbumSchema(
  event: {
    slug: string;
    title: string;
    starts_at: string;
    location_name: string | null;
    image_url: string | null;
  },
  moments: Array<{
    id: string;
    content_type: string;
    media_url: string | null;
    created_at: string;
    display_name: string | null;
    username: string | null;
    ai_description?: string | null;
  }>,
  totalCount: number,
  locale: string,
) {
  // AI caption → JSON-LD description: keep it human-length, no keyword tails.
  // NEVER feed detected_text here — it's OCR exhaust (name tags, phone numbers).
  const truncateDescription = (text: string, max = 125): string => {
    const clean = text.trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  };
  const albumUrl = localizedSiteUrl(
    locale,
    `/events/${event.slug}/moments?view=cinema`,
  );
  const eventUrl = localizedSiteUrl(locale, `/events/${event.slug}`);

  const photos = moments.filter(
    (m) => m.content_type === "photo" && m.media_url,
  );
  const videos = moments.filter(
    (m) => m.content_type === "video" && m.media_url,
  );

  // Unique contributors
  const seen = new Set<string>();
  const contributors = moments
    .filter((m) => {
      const name = m.display_name || m.username;
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .map((m) => m.display_name || m.username);

  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name: `${event.title} — Moments`,
    description: `A cinematic slideshow of ${totalCount} photos and videos from ${event.title}${event.location_name ? ` in ${event.location_name}` : ""}. Captured by ${contributors.length} contributor${contributors.length !== 1 ? "s" : ""} and presented by ĐàLạt.app.`,
    url: albumUrl,
    numberOfItems: totalCount,
    dateCreated: event.starts_at,
    ...(event.image_url && { thumbnailUrl: event.image_url }),
    isPartOf: {
      "@type": "Event",
      name: event.title,
      startDate: event.starts_at,
      url: eventUrl,
      ...(event.location_name && {
        location: {
          "@type": "Place",
          name: event.location_name,
          address: event.location_name,
        },
      }),
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    ...(photos.length > 0 && {
      image: photos.slice(0, 10).map((p) => ({
        "@type": "ImageObject",
        contentUrl: p.media_url,
        uploadDate: p.created_at,
        ...(p.ai_description && {
          description: truncateDescription(p.ai_description),
        }),
        ...(p.display_name && {
          author: { "@type": "Person", name: p.display_name },
        }),
      })),
    }),
    ...(videos.length > 0 && {
      video: videos.slice(0, 5).map((v) => ({
        "@type": "VideoObject",
        contentUrl: v.media_url,
        uploadDate: v.created_at,
        name: `Video moment from ${event.title}`,
        ...(v.display_name && {
          author: { "@type": "Person", name: v.display_name },
        }),
      })),
    }),
    potentialAction: {
      "@type": "ViewAction",
      name: "Watch Cinema Mode",
      target: albumUrl,
    },
  };
}

/**
 * Generate BreadcrumbList schema for navigation
 * https://schema.org/BreadcrumbList
 */
export function generateBreadcrumbSchema(
  items: Array<{ name: string; url: string }>,
  locale: string,
) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http")
        ? item.url
        : localizedSiteUrl(locale, item.url),
    })),
  };

  return schema;
}

/**
 * Generate WebSite schema for the homepage
 * https://schema.org/WebSite
 */
export function generateWebSiteSchema(locale: string) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "Đà Lạt App",
    url: localizedSiteUrl(locale),
    description:
      "Discover events, festivals, and community gatherings in Đà Lạt, Vietnam",
    inLanguage: locale,

    // Search action for sitelinks search box (SEO)
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: localizedSiteUrl(locale, "/search/{search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },

    // Publisher
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: PUBLISHER_LOGO_URL,
      },
    },
  };

  return schema;
}

/**
 * Generate FAQ schema for pages with FAQs
 * https://schema.org/FAQPage
 */
export function generateFAQSchema(
  faqs: Array<{ question: string; answer: string }>,
) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return schema;
}

/**
 * Generate MusicRecording schema for karaoke song pages
 * https://schema.org/MusicRecording
 */
export function generateMusicRecordingSchema(
  track: {
    id: string;
    title: string | null;
    artist: string | null;
    duration_seconds: number | null;
    thumbnail_url: string | null;
    lyrics_lrc: string | null;
  },
  event: {
    slug: string;
    title: string;
    image_url: string | null;
  },
  locale: string,
) {
  const trackUrl = localizedSiteUrl(
    locale,
    `/events/${event.slug}/karaoke/${track.id}`,
  );
  const lyricsUrl = localizedSiteUrl(
    locale,
    `/events/${event.slug}/lyrics/${track.id}`,
  );

  // Extract plain text from LRC for lyrics
  const lyricsText = track.lyrics_lrc
    ? track.lyrics_lrc
        .split("\n")
        .map((line) => line.replace(/^\[\d{1,2}:\d{2}[.:]\d{2,3}\]/, "").trim())
        .filter((text) => text && !text.startsWith("["))
        .join(" ")
        .slice(0, 5000) // Limit for performance
    : null;

  // Format duration as ISO 8601 (PT1M30S)
  const durationISO = track.duration_seconds
    ? `PT${Math.floor(track.duration_seconds / 60)}M${Math.floor(track.duration_seconds % 60)}S`
    : "PT0S";

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    "@id": trackUrl,
    name: track.title || "Untitled",
    url: trackUrl,
    duration: durationISO,

    // Artist
    byArtist: {
      "@type": "MusicGroup",
      name: track.artist || event.title,
    },

    // Album (event as playlist)
    inAlbum: {
      "@type": "MusicAlbum",
      name: event.title,
      url: localizedSiteUrl(locale, `/events/${event.slug}/playlist`),
    },

    // Image
    ...((track.thumbnail_url || event.image_url) && {
      image: track.thumbnail_url || event.image_url,
    }),

    // Lyrics (linked to dedicated lyrics page for SEO)
    ...(lyricsText && {
      recordingOf: {
        "@type": "MusicComposition",
        name: track.title || "Untitled",
        lyrics: {
          "@type": "CreativeWork",
          text: lyricsText,
          url: lyricsUrl,
          inLanguage: locale,
        },
      },
    }),

    // Accessibility
    isAccessibleForFree: true,
    inLanguage: locale,

    // Provider
    provider: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },

    // Content location
    contentLocation: {
      "@type": "Place",
      name: "Đà Lạt, Vietnam",
      geo: {
        "@type": "GeoCoordinates",
        latitude: DA_LAT_GEO.latitude,
        longitude: DA_LAT_GEO.longitude,
      },
    },
  };

  return schema;
}

/**
 * Generate Article schema for blog posts
 * https://schema.org/Article
 */
export function generateBlogArticleSchema(
  post: BlogPostFull & { updated_at?: string },
  locale: string,
) {
  const articleUrl = localizedSiteUrl(
    locale,
    `/blog/${post.category_slug || "changelog"}/${post.slug}`,
  );

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.meta_description || post.story_content.slice(0, 160),
    url: articleUrl,
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.published_at || post.created_at,

    // Image
    ...(post.cover_image_url && {
      image: [post.cover_image_url],
    }),

    // Author (the dalat.app team)
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },

    // Publisher
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: PUBLISHER_LOGO_URL,
      },
    },

    // Article section/category
    ...(post.category_name && {
      articleSection: post.category_name,
    }),

    // Keywords
    ...(post.seo_keywords &&
      post.seo_keywords.length > 0 && {
        keywords: post.seo_keywords.join(", "),
      }),

    // Main content
    articleBody: post.story_content,

    // Word count (rough estimate)
    wordCount: post.story_content.split(/\s+/).length,

    inLanguage: locale,

    // Main entity of page
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
  };

  return schema;
}

/**
 * Generate NewsArticle schema for news posts
 * https://schema.org/NewsArticle
 */
export function generateNewsArticleSchema(
  post: BlogPostFull & {
    source_urls?: Array<{
      url: string;
      title: string;
      publisher: string;
      published_at: string | null;
    }>;
    news_tags?: string[];
    updated_at?: string;
  },
  locale: string,
) {
  const articleUrl = localizedSiteUrl(
    locale,
    `/blog/${post.category_slug || "news"}/${post.slug}`,
  );

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: post.meta_description || post.story_content.slice(0, 160),
    url: articleUrl,
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.published_at || post.created_at,

    // Image (generated OG image as fallback for posts without a cover)
    image: [post.cover_image_url || `${articleUrl}/opengraph-image`],

    // Author (ĐàLạt.app as publisher, with source attribution)
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },

    // Publisher
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: PUBLISHER_LOGO_URL,
      },
    },

    // News-specific
    // Legacy automation keeps its established category URL. Reflect that real
    // section instead of claiming every sourced page belongs to News.
    articleSection: post.category_name || post.category_slug || "DaLat News",
    dateline: "Đà Lạt, Vietnam",

    // Keywords
    ...(post.seo_keywords &&
      post.seo_keywords.length > 0 && {
        keywords: post.seo_keywords.join(", "),
      }),

    // Content
    articleBody: post.story_content,
    wordCount: post.story_content.split(/\s+/).length,

    inLanguage: locale,

    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },

    // Source attribution
    ...(post.source_urls &&
      post.source_urls.length > 0 && {
        isBasedOn: post.source_urls.map((s) => s.url),
        citation: post.source_urls.map((s) => ({
          "@type": "CreativeWork",
          name: s.title,
          url: s.url,
          publisher: {
            "@type": "Organization",
            name: s.publisher,
          },
        })),
      }),
  };

  return schema;
}

/**
 * Generate MusicPlaylist schema for event playlist pages
 * https://schema.org/MusicPlaylist
 */
export function generateMusicPlaylistSchema(
  tracks: Array<{
    id: string;
    title: string | null;
    artist: string | null;
    duration_seconds: number | null;
    thumbnail_url: string | null;
  }>,
  event: {
    slug: string;
    title: string;
    image_url: string | null;
  },
  locale: string,
) {
  const playlistUrl = localizedSiteUrl(
    locale,
    `/events/${event.slug}/playlist`,
  );

  // Calculate total duration
  const totalDurationSeconds = tracks.reduce(
    (sum, track) => sum + (track.duration_seconds || 0),
    0,
  );
  const totalDurationISO =
    totalDurationSeconds > 0
      ? `PT${Math.floor(totalDurationSeconds / 60)}M${Math.floor(totalDurationSeconds % 60)}S`
      : undefined;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MusicPlaylist",
    "@id": playlistUrl,
    name: `${event.title} - Playlist`,
    url: playlistUrl,
    numTracks: tracks.length,
    ...(totalDurationISO && { duration: totalDurationISO }),

    // Image
    ...(event.image_url && { image: event.image_url }),

    // Tracks
    track: tracks.map((track, index) => ({
      "@type": "MusicRecording",
      position: index + 1,
      name: track.title || "Untitled",
      byArtist: {
        "@type": "MusicGroup",
        name: track.artist || event.title,
      },
      ...(track.duration_seconds && {
        duration: `PT${Math.floor(track.duration_seconds / 60)}M${Math.floor(track.duration_seconds % 60)}S`,
      }),
      ...(track.thumbnail_url && { image: track.thumbnail_url }),
      url: localizedSiteUrl(
        locale,
        `/events/${event.slug}/karaoke/${track.id}`,
      ),
    })),

    // Provider
    provider: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },

    // Location context
    contentLocation: {
      "@type": "Place",
      name: "Đà Lạt, Vietnam",
      geo: {
        "@type": "GeoCoordinates",
        latitude: DA_LAT_GEO.latitude,
        longitude: DA_LAT_GEO.longitude,
      },
    },

    isAccessibleForFree: true,
    inLanguage: locale,
  };

  return schema;
}

/**
 * Generate FAQ Schema for lyrics pages (AEO optimization)
 * https://schema.org/FAQPage
 *
 * Targets common questions people ask AI assistants about songs
 */
export function generateLyricsFAQSchema(
  track: {
    title: string | null;
    artist: string | null;
    duration_seconds: number | null;
    lyrics_lrc: string | null;
  },
  event: {
    title: string;
    slug: string;
  },
  lyricsText: string,
  locale: string,
) {
  const trackTitle = track.title || "Untitled";
  const artist = track.artist || event.title;
  const durationFormatted = track.duration_seconds
    ? `${Math.floor(track.duration_seconds / 60)}:${String(Math.floor(track.duration_seconds % 60)).padStart(2, "0")}`
    : null;

  // Extract first verse (first ~200 chars) for lyrics preview
  const lyricsPreview =
    lyricsText.slice(0, 300) + (lyricsText.length > 300 ? "..." : "");

  const faqs =
    locale === "vi"
      ? [
          {
            question: `Ai hát bài "${trackTitle}"?`,
            answer: `"${trackTitle}" được hát bởi ${artist}. Bài hát có trong playlist của sự kiện "${event.title}" trên ĐàLạt.app.`,
          },
          {
            question: `Lời bài hát "${trackTitle}" là gì?`,
            answer: `Lời bài hát "${trackTitle}" của ${artist}: ${lyricsPreview}`,
          },
          {
            question: `Tôi có thể hát karaoke "${trackTitle}" ở đâu?`,
            answer: `Bạn có thể hát karaoke "${trackTitle}" online tại ĐàLạt.app với lời hiển thị theo nhạc. Truy cập trang karaoke để bắt đầu hát ngay!`,
          },
          ...(durationFormatted
            ? [
                {
                  question: `Bài hát "${trackTitle}" dài bao lâu?`,
                  answer: `"${trackTitle}" của ${artist} có thời lượng ${durationFormatted}.`,
                },
              ]
            : []),
        ]
      : [
          {
            question: `Who sings "${trackTitle}"?`,
            answer: `"${trackTitle}" is performed by ${artist}. This song is from the "${event.title}" event playlist on ĐàLạt.app.`,
          },
          {
            question: `What are the lyrics to "${trackTitle}"?`,
            answer: `Lyrics for "${trackTitle}" by ${artist}: ${lyricsPreview}`,
          },
          {
            question: `Where can I sing "${trackTitle}" karaoke?`,
            answer: `You can sing "${trackTitle}" karaoke online at ĐàLạt.app with synchronized lyrics display. Visit the karaoke page to start singing!`,
          },
          ...(durationFormatted
            ? [
                {
                  question: `How long is "${trackTitle}"?`,
                  answer: `"${trackTitle}" by ${artist} has a duration of ${durationFormatted}.`,
                },
              ]
            : []),
        ];

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/**
 * Generate Speakable Schema for voice assistants
 * https://schema.org/SpeakableSpecification
 *
 * Marks content that's suitable for text-to-speech by voice assistants
 */
export function generateSpeakableSchema(
  pageUrl: string,
  speakableCssSelectors: string[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": pageUrl,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: speakableCssSelectors,
    },
  };
}
