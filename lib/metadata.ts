/**
 * Localized Metadata Utilities for dalat.app
 *
 * Generates SEO-optimized metadata with proper:
 * - Canonical URLs with locale prefix
 * - hreflang alternates for all 12 locales
 * - OpenGraph and Twitter card data
 */

import type { Metadata } from "next";
import { locales, type Locale } from "@/lib/i18n/routing";
import { isVideoUrl } from "@/lib/media-utils";

const SITE_URL = "https://dalat.app";
const SITE_NAME = "ĐàLạt.app";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

interface LocalizedMetadataOptions {
  /** Current locale */
  locale: Locale;
  /** Path without locale prefix (e.g., "/events/coffee-meetup" or just "events/coffee-meetup") */
  path: string;
  /** Page title (will be appended with " | dalat.app") */
  title: string;
  /** Page description for SEO */
  description: string;
  /** OG image URL (optional, defaults to site OG image) */
  image?: string;
  /** OG type (default: "website") */
  type?: "website" | "article" | "profile";
  /** Disable title suffix (e.g., for homepage) */
  noTitleSuffix?: boolean;
  /** Additional keywords */
  keywords?: string[];
  /** Author name (for article type) */
  author?: string;
  /** Published time (for article type) */
  publishedTime?: string;
  /** Modified time (for article type) */
  modifiedTime?: string;
}

/**
 * Generate localized metadata with canonical URLs and hreflang alternates
 */
export function generateLocalizedMetadata({
  locale,
  path,
  title,
  description,
  image,
  type = "website",
  noTitleSuffix = false,
  keywords = [],
  author,
  publishedTime,
  modifiedTime,
}: LocalizedMetadataOptions): Metadata {
  // Normalize path (ensure it starts with / but doesn't include locale)
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const cleanPath = normalizedPath === "/" ? "" : normalizedPath;

  // Generate canonical URL
  const canonicalUrl = `${SITE_URL}/${locale}${cleanPath}`;

  // Generate hreflang alternates for all locales
  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = `${SITE_URL}/${loc}${cleanPath}`;
  }
  languages["x-default"] = `${SITE_URL}/en${cleanPath}`;

  // Format title
  const formattedTitle = noTitleSuffix ? title : `${title} | ${SITE_NAME}`;

  // OG image with fallback
  const ogImage = image || DEFAULT_OG_IMAGE;

  const metadata: Metadata = {
    title: formattedTitle,
    description,

    // Keywords
    ...(keywords.length > 0 && {
      keywords: [...keywords, "Đà Lạt", "Vietnam", "events", "ĐàLạt.app"],
    }),

    // Canonical and alternates
    alternates: {
      canonical: canonicalUrl,
      languages,
    },

    // OpenGraph
    openGraph: {
      title,
      description,
      type,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: locale,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      ...(type === "article" && {
        ...(author && { authors: [author] }),
        ...(publishedTime && { publishedTime }),
        ...(modifiedTime && { modifiedTime }),
      }),
    },

    // Twitter
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: [ogImage],
    },

    // Robots
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };

  return metadata;
}

/**
 * Generate metadata for a profile page
 */
export function generateProfileMetadata(
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
  },
  locale: Locale,
  eventCount?: number
): Metadata {
  const name = profile.display_name || profile.username || "User";
  const description = profile.bio
    ? `${profile.bio.slice(0, 150)}${profile.bio.length > 150 ? "..." : ""}`
    : eventCount
    ? `${name} has organized ${eventCount} events in Đà Lạt, Vietnam`
    : `${name}'s profile on ĐàLạt.app - Event discovery in Đà Lạt, Vietnam`;

  // Use username if available, otherwise fall back to user ID for URL
  const profileIdentifier = profile.username || profile.id;

  return generateLocalizedMetadata({
    locale,
    path: `/${profileIdentifier}`,
    title: name,
    description,
    image: profile.avatar_url || undefined,
    type: "profile",
    keywords: [name, "profile", "organizer"],
  });
}

/**
 * Generate metadata for a venue page
 */
export function generateVenueMetadata(
  venue: {
    slug: string;
    name: string;
    description: string | null;
    logo_url: string | null;
    cover_photo_url: string | null;
    venue_type: string | null;
    address: string | null;
  },
  locale: Locale,
  eventCount?: number
): Metadata {
  const venueTypeName = venue.venue_type
    ? venue.venue_type.charAt(0).toUpperCase() + venue.venue_type.slice(1).replace("_", " ")
    : "Venue";
  const description = venue.description
    ? `${venue.description.slice(0, 150)}${venue.description.length > 150 ? "..." : ""}`
    : eventCount
    ? `${venue.name} is a ${venueTypeName.toLowerCase()} in Đà Lạt hosting ${eventCount} upcoming events`
    : venue.address
    ? `${venue.name} - ${venueTypeName} located at ${venue.address} in Đà Lạt, Vietnam`
    : `${venue.name} - ${venueTypeName} in Đà Lạt, Vietnam`;

  return generateLocalizedMetadata({
    locale,
    path: `/venues/${venue.slug}`,
    title: venue.name,
    description,
    image: venue.cover_photo_url || venue.logo_url || undefined,
    type: "profile",
    keywords: [venue.name, venueTypeName.toLowerCase(), "venue", "Đà Lạt", "events"],
  });
}

/**
 * Generate metadata for an organizer page
 */
export function generateOrganizerMetadata(
  organizer: {
    slug: string;
    name: string;
    description: string | null;
    logo_url: string | null;
  },
  locale: Locale,
  eventCount?: number
): Metadata {
  const description = organizer.description
    ? `${organizer.description.slice(0, 150)}${organizer.description.length > 150 ? "..." : ""}`
    : eventCount
    ? `${organizer.name} has organized ${eventCount} events in Đà Lạt, Vietnam`
    : `${organizer.name} - Event organizer in Đà Lạt, Vietnam`;

  return generateLocalizedMetadata({
    locale,
    path: `/organizers/${organizer.slug}`,
    title: organizer.name,
    description,
    image: organizer.logo_url || undefined,
    type: "profile",
    keywords: [organizer.name, "organizer", "venue", "events"],
  });
}

/**
 * Generate metadata for a festival page
 */
export function generateFestivalMetadata(
  festival: {
    slug: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    cover_image_url: string | null;
    start_date: string;
    end_date: string;
  },
  locale: Locale,
  eventCount?: number
): Metadata {
  const description = festival.description
    ? `${festival.description.slice(0, 150)}${festival.description.length > 150 ? "..." : ""}`
    : festival.subtitle
    ? festival.subtitle
    : eventCount
    ? `${festival.title} - Festival with ${eventCount} events in Đà Lạt, Vietnam`
    : `${festival.title} - Festival in Đà Lạt, Vietnam`;

  return generateLocalizedMetadata({
    locale,
    path: `/festivals/${festival.slug}`,
    title: festival.title,
    description,
    image: festival.cover_image_url || undefined,
    type: "article",
    keywords: [festival.title, "festival", "Đà Lạt"],
    publishedTime: festival.start_date,
  });
}

/**
 * Generate metadata for an event series page
 */
export function generateSeriesMetadata(
  series: {
    slug: string;
    title: string;
    description: string | null;
    image_url: string | null;
    location_name: string | null;
  },
  locale: Locale,
  upcomingCount?: number
): Metadata {
  const description = series.description
    ? `${series.description.slice(0, 150)}${series.description.length > 150 ? "..." : ""}`
    : upcomingCount
    ? `${series.title} - Recurring event series with ${upcomingCount} upcoming dates in Đà Lạt`
    : `${series.title} - Recurring event series in Đà Lạt, Vietnam`;

  return generateLocalizedMetadata({
    locale,
    path: `/series/${series.slug}`,
    title: series.title,
    description,
    image: series.image_url || undefined,
    type: "article",
    keywords: [series.title, "recurring event", "series", "Đà Lạt"],
  });
}

/**
 * Generate metadata for the global moments discovery page
 */
export function generateMomentsDiscoveryMetadata(
  locale: Locale,
  title: string,
  description: string
): Metadata {
  return generateLocalizedMetadata({
    locale,
    path: "/moments",
    title,
    description,
    type: "website",
    keywords: ["moments", "photos", "videos", "Đà Lạt"],
  });
}

/**
 * Generate metadata for an individual moment page
 */
export function generateMomentMetadata(
  moment: {
    id: string;
    created_at: string;
    text_content: string | null;
    media_url: string | null;
    content_type: string;
    user_id: string;
    profiles?: { display_name: string | null; username: string | null };
    events?: { title: string | null };
  },
  locale: Locale
): Metadata {
  const userName = moment.profiles?.display_name || moment.profiles?.username || "Someone";
  const eventTitle = moment.events?.title || "an event";
  const description = moment.text_content
    ? moment.text_content.slice(0, 150)
    : `${userName} shared a moment from ${eventTitle}`;

  const title = `${userName}'s moment at ${eventTitle}`;
  const fallbackOg = `${SITE_URL}/${locale}/moments/${moment.id}/opengraph-image`;
  const image = moment.media_url && !isVideoUrl(moment.media_url) ? moment.media_url : fallbackOg;

  return generateLocalizedMetadata({
    locale,
    path: `/moments/${moment.id}`,
    title,
    description,
    image,
    type: "article",
    author: userName,
    publishedTime: moment.created_at,
    keywords: [userName, eventTitle, "moment", "Đà Lạt"],
  });
}
