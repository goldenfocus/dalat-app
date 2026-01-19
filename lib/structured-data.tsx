/**
 * JSON-LD Structured Data Utilities for dalat.app
 *
 * Implements Schema.org structured data for:
 * - SEO: Rich results in Google, Bing, etc.
 * - AEO: AI assistants can extract structured event data
 *
 * Reference: https://schema.org
 */

import type { Event, Profile, Organizer, Festival, EventSeries, Moment } from "@/lib/types";
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
  attendeeCount?: number
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

    // Image
    ...(event.image_url && {
      image: [event.image_url],
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
