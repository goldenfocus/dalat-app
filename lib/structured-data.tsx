/**
 * JSON-LD Structured Data Utilities for dalat.app
 *
 * Implements Schema.org structured data for:
 * - SEO: Rich results in Google, Bing, etc.
 * - AEO: AI assistants can extract structured event data
 *
 * Reference: https://schema.org
 */

import type { Event, Profile, Organizer, Festival, EventSeries, Moment, Venue, VenueType } from "@/lib/types";
import type { BlogPostFull } from "@/lib/types/blog";

const SITE_URL = "https://dalat.app";
const SITE_NAME = "ĐàLạt.app";

// Đà Lạt, Vietnam coordinates
const DA_LAT_GEO = {
  latitude: 11.9404,
  longitude: 108.4583,
};

/**
 * React component to render JSON-LD script tag
 *
 * Security note: JSON.stringify escapes special characters (<, >, &, etc.)
 * making XSS injection impossible. The data is server-controlled schema objects,
 * not user-provided HTML. This is the standard pattern for JSON-LD in Next.js.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/metadata#json-ld
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const jsonLdArray = Array.isArray(data) ? data : [data];

  return (
    <>
      {jsonLdArray.map((item, index) => (
        <script
          key={index}
          type="application/ld+json"
          // Safe: JSON.stringify escapes special characters, preventing XSS
          // Data is server-controlled schema objects, not user HTML
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}

/**
 * Generate Event schema for event pages
 * https://schema.org/Event
 */
export function generateEventSchema(
  event: Event & { profiles?: Profile; organizers?: Organizer | null },
  locale: string,
  attendeeCount?: number,
  imageMetadata?: { alt?: string | null; description?: string | null }
) {
  const eventUrl = `${SITE_URL}/${locale}/events/${event.slug}`;

  // Determine event status
  const eventStatus = event.status === "cancelled"
    ? "https://schema.org/EventCancelled"
    : new Date(event.starts_at) < new Date()
    ? "https://schema.org/EventPostponed" // Past events
    : "https://schema.org/EventScheduled";

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || `Event in Đà Lạt, Vietnam`,
    url: eventUrl,
    startDate: event.starts_at,
    ...(event.ends_at && { endDate: event.ends_at }),
    eventStatus,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",

    // Location
    location: event.location_name || event.address
      ? {
          "@type": "Place",
          name: event.location_name || "Đà Lạt, Vietnam",
          ...(event.address && {
            address: {
              "@type": "PostalAddress",
              streetAddress: event.address,
              addressLocality: "Đà Lạt",
              addressRegion: "Lam Dong",
              addressCountry: "VN",
            },
          }),
          geo: {
            "@type": "GeoCoordinates",
            latitude: DA_LAT_GEO.latitude,
            longitude: DA_LAT_GEO.longitude,
          },
          ...(event.google_maps_url && { hasMap: event.google_maps_url }),
        }
      : {
          "@type": "Place",
          name: "Đà Lạt, Vietnam",
          geo: {
            "@type": "GeoCoordinates",
            latitude: DA_LAT_GEO.latitude,
            longitude: DA_LAT_GEO.longitude,
          },
        },

    // Image - with structured metadata for AI search engines
    ...(event.image_url && {
      image: imageMetadata?.alt || imageMetadata?.description
        ? {
            "@type": "ImageObject",
            url: event.image_url,
            ...(imageMetadata.alt && { name: imageMetadata.alt }),
            ...(imageMetadata.description && { description: imageMetadata.description }),
          }
        : [event.image_url],
    }),

    // Organizer - use Organizer if available, otherwise fall back to creator profile
    organizer: event.organizers
      ? {
          "@type": "Organization",
          name: event.organizers.name,
          url: `${SITE_URL}/${locale}/organizers/${event.organizers.slug}`,
          ...(event.organizers.logo_url && { logo: event.organizers.logo_url }),
        }
      : event.profiles
      ? {
          "@type": "Person",
          name: event.profiles.display_name || event.profiles.username || "Event Organizer",
          // Use username if available, otherwise fall back to user ID for URL
          url: `${SITE_URL}/${locale}/${event.profiles.username || event.profiles.id}`,
        }
      : undefined,

    // Offers (Free event - price: 0 shows "Free" in Rich Results)
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "VND",
      availability: event.capacity
        ? attendeeCount && attendeeCount >= event.capacity
          ? "https://schema.org/SoldOut"
          : "https://schema.org/InStock"
        : "https://schema.org/InStock",
      url: eventUrl,
      validFrom: event.created_at,
    },

    // Attendance info
    ...(attendeeCount !== undefined && {
      maximumAttendeeCapacity: event.capacity || undefined,
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
  eventCount?: number
) {
  const organizerUrl = `${SITE_URL}/${locale}/organizers/${organizer.slug}`;

  // Map organizer types to Schema.org types
  const schemaType = organizer.organizer_type === "venue"
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
    ...(eventCount !== undefined && eventCount > 0 && {
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
  other: "LocalBusiness",
};

/**
 * Generate LocalBusiness schema for venue pages
 * https://schema.org/LocalBusiness
 */
export function generateLocalBusinessSchema(
  venue: Venue,
  locale: string,
  eventCount?: number
) {
  const venueUrl = `${SITE_URL}/${locale}/venues/${venue.slug}`;
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
    sameAs: [
      venue.website_url,
      venue.facebook_url,
      venue.instagram_url,
    ].filter(Boolean),

    // Opening hours
    ...(openingHoursSpec && openingHoursSpec.length > 0 && {
      openingHoursSpecification: openingHoursSpec,
    }),

    // Price range
    ...(venue.price_range && { priceRange: venue.price_range }),

    // Amenities as features
    ...(venue.has_wifi && { amenityFeature: { "@type": "LocationFeatureSpecification", name: "WiFi", value: true } }),

    // Events at this venue
    ...(eventCount !== undefined && eventCount > 0 && {
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
  eventCount?: number
) {
  const festivalUrl = `${SITE_URL}/${locale}/festivals/${festival.slug}`;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Festival",
    name: festival.title,
    ...(festival.subtitle && { alternateName: festival.subtitle }),
    description: festival.description || `${festival.title} - Festival in Đà Lạt, Vietnam`,
    url: festivalUrl,
    startDate: festival.start_date,
    endDate: festival.end_date,
    eventStatus: festival.status === "cancelled"
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
    ...(eventCount !== undefined && eventCount > 0 && {
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
  eventCount?: number
) {
  // Use username if available, otherwise fall back to user ID for URL
  const profileIdentifier = profile.username || profile.id;
  const profileUrl = `${SITE_URL}/${locale}/${profileIdentifier}`;

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
    ...(eventCount !== undefined && eventCount > 0 && {
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
  upcomingCount?: number
) {
  const seriesUrl = `${SITE_URL}/${locale}/series/${series.slug}`;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    name: series.title,
    description: series.description || `Recurring event series in Đà Lạt, Vietnam`,
    url: seriesUrl,
    startDate: series.first_occurrence,
    ...(series.rrule_until && { endDate: series.rrule_until }),

    // Location
    location: series.location_name
      ? {
          "@type": "Place",
          name: series.location_name,
          ...(series.address && {
            address: {
              "@type": "PostalAddress",
              streetAddress: series.address,
              addressLocality: "Đà Lạt",
              addressRegion: "Lam Dong",
              addressCountry: "VN",
            },
          }),
          geo: {
            "@type": "GeoCoordinates",
            latitude: DA_LAT_GEO.latitude,
            longitude: DA_LAT_GEO.longitude,
          },
        }
      : {
          "@type": "Place",
          name: "Đà Lạt, Vietnam",
          geo: {
            "@type": "GeoCoordinates",
            latitude: DA_LAT_GEO.latitude,
            longitude: DA_LAT_GEO.longitude,
          },
        },

    // Image
    ...(series.image_url && { image: [series.image_url] }),

    // Organizer
    ...(series.organizers && {
      organizer: {
        "@type": "Organization",
        name: series.organizers.name,
        url: `${SITE_URL}/${locale}/organizers/${series.organizers.slug}`,
      },
    }),

    // Sub-events
    ...(upcomingCount !== undefined && upcomingCount > 0 && {
      subEvent: {
        "@type": "ItemList",
        numberOfItems: upcomingCount,
      },
    }),

    // Free
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
 * Generate SocialMediaPosting schema for moment pages
 * https://schema.org/SocialMediaPosting
 */
export function generateMomentSchema(
  moment: Moment & { profiles?: Profile; events?: Event },
  locale: string
) {
  const momentUrl = `${SITE_URL}/${locale}/moments/${moment.id}`;
  const userName = moment.profiles?.display_name || moment.profiles?.username || "Someone";
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
      url: `${SITE_URL}/${locale}/${userIdentifier}`,
    },
    about: eventSlug
      ? {
          "@type": "Event",
          name: eventTitle,
          url: `${SITE_URL}/${locale}/events/${eventSlug}`,
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
  locale: string
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Moments",
    itemListElement: moments.map((moment, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/moments/${moment.id}`,
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
  }>,
  totalCount: number,
  locale: string
) {
  const albumUrl = `${SITE_URL}/${locale}/events/${event.slug}/moments?view=cinema`;
  const eventUrl = `${SITE_URL}/${locale}/events/${event.slug}`;

  const photos = moments.filter((m) => m.content_type === "photo" && m.media_url);
  const videos = moments.filter((m) => m.content_type === "video" && m.media_url);

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
        ...(p.display_name && { author: { "@type": "Person", name: p.display_name } }),
      })),
    }),
    ...(videos.length > 0 && {
      video: videos.slice(0, 5).map((v) => ({
        "@type": "VideoObject",
        contentUrl: v.media_url,
        uploadDate: v.created_at,
        name: `Video moment from ${event.title}`,
        ...(v.display_name && { author: { "@type": "Person", name: v.display_name } }),
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
  locale: string
) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${SITE_URL}/${locale}${item.url}`,
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
    url: `${SITE_URL}/${locale}`,
    description: "Discover events, festivals, and community gatherings in Đà Lạt, Vietnam",
    inLanguage: locale,

    // Search action for sitelinks search box (SEO)
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/${locale}/search/{search_term_string}`,
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
        url: `${SITE_URL}/icon-512.png`,
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
  faqs: Array<{ question: string; answer: string }>
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
  locale: string
) {
  const trackUrl = `${SITE_URL}/${locale}/events/${event.slug}/karaoke/${track.id}`;
  const lyricsUrl = `${SITE_URL}/${locale}/events/${event.slug}/lyrics/${track.id}`;

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
      url: `${SITE_URL}/${locale}/events/${event.slug}/playlist`,
    },

    // Image
    ...(track.thumbnail_url || event.image_url) && {
      image: track.thumbnail_url || event.image_url,
    },

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
  post: BlogPostFull,
  locale: string
) {
  const articleUrl = `${SITE_URL}/${locale}/blog/${post.category_slug || "changelog"}/${post.slug}`;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.meta_description || post.story_content.slice(0, 160),
    url: articleUrl,
    datePublished: post.published_at || post.created_at,
    dateModified: post.published_at || post.created_at,

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
        url: `${SITE_URL}/icon-512.png`,
      },
    },

    // Article section/category
    ...(post.category_name && {
      articleSection: post.category_name,
    }),

    // Keywords
    ...(post.seo_keywords && post.seo_keywords.length > 0 && {
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
  locale: string
) {
  const playlistUrl = `${SITE_URL}/${locale}/events/${event.slug}/playlist`;

  // Calculate total duration
  const totalDurationSeconds = tracks.reduce(
    (sum, track) => sum + (track.duration_seconds || 0),
    0
  );
  const totalDurationISO = totalDurationSeconds > 0
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
      url: `${SITE_URL}/${locale}/events/${event.slug}/karaoke/${track.id}`,
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
  locale: string
) {
  const trackTitle = track.title || "Untitled";
  const artist = track.artist || event.title;
  const durationFormatted = track.duration_seconds
    ? `${Math.floor(track.duration_seconds / 60)}:${String(Math.floor(track.duration_seconds % 60)).padStart(2, "0")}`
    : null;

  // Extract first verse (first ~200 chars) for lyrics preview
  const lyricsPreview = lyricsText.slice(0, 300) + (lyricsText.length > 300 ? "..." : "");

  const faqs = locale === "vi"
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
  speakableCssSelectors: string[]
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

// ====================================================
// SEO/AEO/GEO Schema Generators (Phase 4)
// ====================================================

// Note: generateFAQSchema and generateWebSiteSchema already exist above.
// The following are NEW schemas added for the SEO pipeline.

/**
 * Generate HowTo Schema for activity/travel guides.
 * Powers "How to" rich results (e.g., "How to get to Dalat").
 */
export function generateHowToSchema(params: {
  name: string;
  description: string;
  steps: Array<{ name: string; text: string; image?: string }>;
  totalTime?: string; // ISO 8601 duration, e.g., "PT2H30M"
  estimatedCost?: { currency: string; value: string };
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: params.name,
    description: params.description,
    ...(params.totalTime && { totalTime: params.totalTime }),
    ...(params.estimatedCost && {
      estimatedCost: {
        "@type": "MonetaryAmount",
        currency: params.estimatedCost.currency,
        value: params.estimatedCost.value,
      },
    }),
    step: params.steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
      ...(step.image && { image: step.image }),
    })),
  };
}

/**
 * Generate TouristDestination Schema for the Da Lat mega pillar.
 * Helps AI assistants and Google understand Da Lat as a destination entity.
 */
export function generateTouristDestinationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: "Da Lat",
    alternateName: ["Dalat", "Da Lat City"],
    description:
      "Highland city in Vietnam's Central Highlands known for cool climate, French colonial architecture, coffee, flowers, and vibrant creative community.",
    url: SITE_URL,
    geo: {
      "@type": "GeoCoordinates",
      latitude: DA_LAT_GEO.latitude,
      longitude: DA_LAT_GEO.longitude,
      elevation: "1500",
    },
    containedInPlace: {
      "@type": "AdministrativeArea",
      name: "Lam Dong Province",
      containedInPlace: {
        "@type": "Country",
        name: "Vietnam",
      },
    },
    touristType: [
      "Adventure travelers",
      "Food tourists",
      "Cultural tourists",
      "Digital nomads",
      "Families",
      "Couples",
    ],
    includesAttraction: [
      {
        "@type": "TouristAttraction",
        name: "Xuan Huong Lake",
        description: "Central lake in the heart of Da Lat city",
      },
      {
        "@type": "TouristAttraction",
        name: "Langbiang Mountain",
        description: "Highest peak in the Da Lat area at 2,167m",
      },
      {
        "@type": "TouristAttraction",
        name: "Da Lat Night Market",
        description: "Famous night market with local food, crafts, and souvenirs",
      },
    ],
  };
}

/**
 * Generate ItemList Schema for "Best of" listicle articles.
 * Powers ranked list rich snippets in Google.
 */
export function generateItemListSchema(params: {
  name: string;
  description: string;
  items: Array<{ name: string; url?: string; position: number; image?: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: params.name,
    description: params.description,
    numberOfItems: params.items.length,
    itemListElement: params.items.map((item) => ({
      "@type": "ListItem",
      position: item.position,
      name: item.name,
      ...(item.url && { url: `${SITE_URL}${item.url}` }),
      ...(item.image && { image: item.image }),
    })),
  };
}

/**
 * Generate AggregateRating Schema for venue/place pages.
 * Shows star ratings in search results.
 */
export function generateAggregateRatingSchema(params: {
  name: string;
  ratingValue: number;
  ratingCount: number;
  bestRating?: number;
}) {
  return {
    "@type": "AggregateRating",
    ratingValue: params.ratingValue,
    ratingCount: params.ratingCount,
    bestRating: params.bestRating ?? 5,
    worstRating: 1,
  };
}

/**
 * Generate Breadcrumb Schema for any page.
 * Shows navigation path in search results.
 *
 * Note: A simpler generateBreadcrumbSchema already exists above for
 * locale-aware breadcrumbs. This version is for non-locale contexts.
 */
export function generateBreadcrumbListSchema(
  items: Array<{ name: string; url: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}
