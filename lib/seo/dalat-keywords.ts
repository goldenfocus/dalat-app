/**
 * Đà Lạt SEO/AEO/GEO Keywords Engine
 *
 * Provides content-type-aware keyword enrichment for all pages.
 * Used in metadata generation, structured data, and on-page SEO.
 */

export const DALAT_KEYWORDS = {
  // Location variations (universal)
  locations: [
    "Đà Lạt",
    "Da Lat",
    "Dalat",
    "Lâm Đồng",
    "Lam Dong",
    "Vietnam highlands",
    "Central Highlands Vietnam",
  ],

  // Music/cultural terms
  music: [
    "nhạc Đà Lạt",
    "Dalat music scene",
    "Vietnamese indie",
    "live music Dalat",
    "acoustic Dalat",
    "cafe music Vietnam",
  ],

  // Karaoke specific
  karaoke: [
    "karaoke Đà Lạt",
    "karaoke online Vietnam",
    "hát karaoke",
    "sing along Vietnamese",
    "lyrics with music",
  ],

  // Vibes/atmosphere (universal)
  vibes: [
    "foggy city vibes",
    "mountain town vibes",
    "pine forest sounds",
    "highland melodies",
    "romantic Dalat",
    "chill Vietnam",
  ],

  // Events & nightlife
  events: [
    "things to do in Dalat",
    "Dalat events",
    "Dalat nightlife",
    "what to do in Da Lat",
    "Da Lat activities",
    "events in Đà Lạt tonight",
    "Dalat weekend events",
    "Dalat community events",
  ],

  // Venues & places
  venues: [
    "best cafes in Dalat",
    "Dalat restaurants",
    "Da Lat bars",
    "Dalat coworking",
    "Dalat hotels",
    "quán cafe Đà Lạt",
    "nhà hàng Đà Lạt",
  ],

  // Food & drink
  food: [
    "Dalat food",
    "ẩm thực Đà Lạt",
    "Dalat coffee",
    "cà phê Đà Lạt",
    "Da Lat street food",
    "Dalat local food",
  ],

  // Travel & tourism
  travel: [
    "Dalat travel guide",
    "du lịch Đà Lạt",
    "Dalat Vietnam travel",
    "visit Dalat",
    "Dalat tourism",
    "Dalat itinerary",
  ],

  // Community & culture
  community: [
    "Dalat expat community",
    "Dalat digital nomads",
    "Dalat local culture",
    "văn hóa Đà Lạt",
    "Dalat art scene",
    "Dalat creative community",
  ],

  // Nature & outdoors
  nature: [
    "Dalat hiking",
    "Dalat waterfalls",
    "Dalat pine forests",
    "Dalat flower gardens",
    "Dalat nature",
    "outdoor activities Dalat",
  ],
};

/**
 * Get random keywords from a category
 */
export function getRandomKeywords(
  category: keyof typeof DALAT_KEYWORDS,
  count: number = 2
): string[] {
  const keywords = DALAT_KEYWORDS[category];
  const shuffled = [...keywords].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get a mix of keywords from all categories
 */
export function getMixedKeywords(count: number = 4): string[] {
  const all = Object.values(DALAT_KEYWORDS).flat();
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generate SEO keywords for a music track
 */
export function getTrackSeoKeywords(
  trackTitle: string | null,
  artist: string | null,
  locale: string
): string[] {
  const baseKeywords = [
    trackTitle,
    artist,
    trackTitle && `${trackTitle} lyrics`,
    trackTitle && `${trackTitle} karaoke`,
    artist && `${artist} songs`,
  ].filter(Boolean) as string[];

  // Add locale-specific Dalat keywords
  const dalatKeywords = locale === "vi"
    ? [
        "nhạc Đà Lạt",
        "lời bài hát",
        "karaoke online",
        "hát karaoke Việt Nam",
        ...getRandomKeywords("locations", 1),
      ]
    : [
        "Dalat music",
        "Vietnamese lyrics",
        "karaoke online",
        "Vietnam music scene",
        ...getRandomKeywords("locations", 1),
      ];

  return [...baseKeywords, ...dalatKeywords, ...getRandomKeywords("vibes", 2)];
}

// ─── Content-Type-Specific Keyword Generators ───────────────────────────────

/**
 * Generate SEO keywords for an event page.
 * Combines event-specific terms with Đà Lạt long-tail phrases.
 */
export function getEventSeoKeywords(
  event: {
    title: string;
    location_name?: string | null;
    ai_tags?: string[] | null;
    venue_type?: string | null;
  },
  locale: string
): string[] {
  const keywords: string[] = [event.title];

  if (event.location_name) {
    keywords.push(event.location_name);
    keywords.push(`${event.location_name} Đà Lạt`);
  }

  if (event.ai_tags?.length) {
    keywords.push(...event.ai_tags.slice(0, 5));
  }

  // Venue type enrichment
  if (event.venue_type) {
    const venueMap: Record<string, string[]> = {
      cafe: ["cafe events Dalat", "quán cafe Đà Lạt"],
      bar: ["Dalat nightlife", "bars in Dalat"],
      restaurant: ["Dalat food events", "dining Đà Lạt"],
      gallery: ["Dalat art events", "triển lãm Đà Lạt"],
      hotel: ["Dalat hotel events"],
      coworking: ["Dalat coworking events", "digital nomads Dalat"],
      outdoor: ["outdoor events Dalat", "Dalat nature activities"],
    };
    keywords.push(...(venueMap[event.venue_type] || []));
  }

  const localeKeywords = locale === "vi"
    ? ["sự kiện Đà Lạt", "hoạt động Đà Lạt", ...getRandomKeywords("locations", 1)]
    : ["Dalat events", "things to do Dalat", ...getRandomKeywords("locations", 1)];

  return [...keywords, ...localeKeywords, ...getRandomKeywords("vibes", 1)];
}

/**
 * Generate SEO keywords for a venue page.
 */
export function getVenueSeoKeywords(
  venue: {
    name: string;
    venue_type?: string | null;
    tags?: string[] | null;
    cuisine_types?: string[] | null;
  },
  locale: string
): string[] {
  const keywords: string[] = [venue.name, `${venue.name} Đà Lạt`];

  const typeKeywords: Record<string, string[]> = {
    cafe: ["best cafes Dalat", "quán cafe Đà Lạt", "coffee Dalat", "cà phê Đà Lạt"],
    bar: ["best bars Dalat", "Dalat nightlife", "quán bar Đà Lạt", "Dalat drinks"],
    restaurant: ["best restaurants Dalat", "nhà hàng Đà Lạt", "Dalat food", "where to eat Dalat"],
    gallery: ["Dalat art gallery", "Dalat exhibitions", "triển lãm Đà Lạt"],
    park: ["Dalat parks", "công viên Đà Lạt", "outdoor Dalat"],
    hotel: ["Dalat hotels", "khách sạn Đà Lạt", "where to stay Dalat"],
    coworking: ["Dalat coworking", "digital nomad Dalat", "work from Dalat"],
    community_center: ["Dalat community", "community center Đà Lạt"],
    outdoor: ["outdoor activities Dalat", "Dalat adventure", "Dalat nature"],
    homestay: ["Dalat homestay", "homestay Đà Lạt", "Dalat accommodation"],
  };

  if (venue.venue_type && typeKeywords[venue.venue_type]) {
    keywords.push(...typeKeywords[venue.venue_type]);
  }

  if (venue.tags?.length) {
    keywords.push(...venue.tags.slice(0, 5));
  }

  if (venue.cuisine_types?.length) {
    keywords.push(...venue.cuisine_types.map((c) => `${c} food Dalat`));
  }

  const localeKeywords = locale === "vi"
    ? ["địa điểm Đà Lạt", ...getRandomKeywords("locations", 1)]
    : ["places in Dalat", ...getRandomKeywords("locations", 1)];

  return [...keywords, ...localeKeywords];
}

/**
 * Generate SEO keywords for a moment (photo/video/audio).
 */
export function getMomentSeoKeywords(
  moment: {
    content_type: string;
    ai_tags?: string[] | null;
    detected_objects?: string[] | null;
    mood?: string | null;
    event_title?: string | null;
    location_name?: string | null;
  },
  locale: string
): string[] {
  const keywords: string[] = [];

  if (moment.event_title) {
    keywords.push(moment.event_title);
  }

  if (moment.location_name) {
    keywords.push(`${moment.location_name} Đà Lạt`);
  }

  if (moment.ai_tags?.length) {
    keywords.push(...moment.ai_tags.slice(0, 5));
  }

  if (moment.detected_objects?.length) {
    keywords.push(...moment.detected_objects.slice(0, 3));
  }

  if (moment.mood) {
    keywords.push(`${moment.mood} Dalat`);
  }

  // Content type enrichment
  const typeKeywords: Record<string, string[]> = {
    photo: ["photos Dalat", "ảnh Đà Lạt", "Dalat photography"],
    video: ["video Dalat", "Dalat moments", "video Đà Lạt"],
    audio: ["sounds of Dalat", "Dalat music", "âm nhạc Đà Lạt"],
  };
  keywords.push(...(typeKeywords[moment.content_type] || []));

  const localeKeywords = locale === "vi"
    ? ["khoảnh khắc Đà Lạt", ...getRandomKeywords("locations", 1)]
    : ["Dalat moments", ...getRandomKeywords("locations", 1)];

  return [...keywords, ...localeKeywords];
}

/**
 * Generate SEO keywords for a blog post.
 */
export function getBlogSeoKeywords(
  post: {
    title: string;
    seo_keywords?: string[] | null;
    category_slug?: string | null;
  },
  locale: string
): string[] {
  const keywords: string[] = [post.title];

  if (post.seo_keywords?.length) {
    keywords.push(...post.seo_keywords);
  }

  const categoryKeywords: Record<string, string[]> = {
    changelog: ["Dalat app updates", "ĐàLạt.app changelog"],
    stories: ["Dalat stories", "life in Dalat", "câu chuyện Đà Lạt"],
    guides: ["Dalat guide", "hướng dẫn Đà Lạt", "Dalat tips"],
  };

  if (post.category_slug && categoryKeywords[post.category_slug]) {
    keywords.push(...categoryKeywords[post.category_slug]);
  }

  const localeKeywords = locale === "vi"
    ? ["blog Đà Lạt", "tin tức Đà Lạt", ...getRandomKeywords("locations", 1)]
    : ["Dalat blog", "Dalat news", ...getRandomKeywords("locations", 1)];

  return [...keywords, ...localeKeywords, ...getRandomKeywords("community", 1)];
}

/**
 * Build an SEO-optimized meta description by enriching content with Đà Lạt context.
 * Ensures the description is 150-160 chars and includes location keywords.
 */
export function buildSeoDescription(
  description: string | null,
  context: {
    contentType: "event" | "venue" | "moment" | "blog" | "organizer" | "festival";
    title: string;
    location_name?: string | null;
    venue_type?: string | null;
    date?: string | null;
  }
): string {
  // If we have a good description, enrich it with Đà Lạt context
  if (description && description.length > 30) {
    const base = description.slice(0, 130);
    // Check if Dalat/Đà Lạt is already mentioned
    const hasDalat = /[đd]à\s*l[aạ]t|dalat/i.test(base);
    if (hasDalat) {
      return base.length < 150 ? base : `${base.slice(0, 147)}...`;
    }
    // Append Đà Lạt context
    return `${base.slice(0, 120)}${base.length > 120 ? "..." : ""} — Đà Lạt, Vietnam`;
  }

  // Generate description from context
  switch (context.contentType) {
    case "event": {
      const parts = [context.title];
      if (context.date) parts.push(context.date);
      if (context.location_name) parts.push(`at ${context.location_name}`);
      parts.push("in Đà Lạt, Vietnam");
      return parts.join(" · ").slice(0, 160);
    }
    case "venue": {
      const type = context.venue_type
        ? context.venue_type.charAt(0).toUpperCase() + context.venue_type.slice(1).replace("_", " ")
        : "Venue";
      return `${context.title} — ${type} in Đà Lạt, Vietnam. Discover events, photos, and what's happening here.`.slice(0, 160);
    }
    case "moment":
      return `A moment captured in Đà Lạt — ${context.title}. Discover authentic experiences in Vietnam's highland city.`.slice(0, 160);
    case "blog":
      return `${context.title} — Stories, guides, and updates from Đà Lạt, Vietnam's beloved highland city.`.slice(0, 160);
    case "organizer":
      return `${context.title} — Event organizer in Đà Lạt, Vietnam. Discover their upcoming events and community activities.`.slice(0, 160);
    case "festival":
      return `${context.title} — Festival in Đà Lạt, Vietnam. Join the celebration in Vietnam's highland city.`.slice(0, 160);
    default:
      return `${context.title} — Discover Đà Lạt, Vietnam's highland city. Events, culture, and authentic experiences.`.slice(0, 160);
  }
}
