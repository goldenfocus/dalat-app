import { describe, expect, it } from "vitest";
import type { Event, Organizer } from "@/lib/types";
import type { BlogPostFull } from "@/lib/types/blog";
import {
  generateBreadcrumbSchema,
  generateBlogArticleSchema,
  generateEventSchema,
  generateNewsArticleSchema,
  generateWebSiteSchema,
  serializeJsonLd,
} from "./structured-data";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-id",
    slug: "da-lat-flower-festival-2026",
    previous_slugs: [],
    tribe_id: null,
    tribe_visibility: "public",
    organizer_id: null,
    venue_id: null,
    title: "Festival Hoa Đà Lạt 2026",
    description: "Mô tả tiếng Việt",
    image_url: "https://cdn.dalat.app/flower-festival.jpg",
    location_name: "Lâm Viên Square",
    address: "Trần Quốc Toản, Phường Xuân Hương - Đà Lạt",
    google_maps_url: "https://maps.google.com/example",
    latitude: 11.9404,
    longitude: 108.4583,
    has_private_details: false,
    external_chat_url: null,
    starts_at: "2020-12-19T12:00:00.000Z",
    ends_at: "2020-12-31T15:00:00.000Z",
    timezone: "Asia/Ho_Chi_Minh",
    capacity: null,
    is_online: false,
    online_link: null,
    title_position: "bottom",
    image_fit: "cover",
    focal_point: null,
    price_type: null,
    ticket_tiers: null,
    status: "published",
    created_by: "profile-id",
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-02T00:00:00.000Z",
    source_locale: "vi",
    ai_tags: [],
    ai_tags_updated_at: null,
    spam_score: 0,
    spam_reason: null,
    spam_checked_at: null,
    sponsor_tier: null,
    series_id: null,
    series_instance_date: null,
    is_exception: false,
    exception_type: null,
    linked_past_event_id: null,
    ...overrides,
  };
}

describe("serializeJsonLd", () => {
  it("preserves user-authored data without allowing script termination", () => {
    const payload = {
      name: '</script><script>alert("json-ld-xss")</script>',
      description: "Flowers & festivities > everything else",
    };
    const serialized = serializeJsonLd(payload);

    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized).not.toContain("&");
    expect(serialized).not.toContain("</script>");
    expect(JSON.parse(serialized)).toEqual(payload);
  });
});

describe("generateEventSchema", () => {
  it("aligns name and description with visible localized content", () => {
    const schema = generateEventSchema(
      makeEvent(),
      "en",
      undefined,
      { alt: "Flowers around Lâm Viên Square" },
      {
        title: "11th Da Lat Flower Festival 2026",
        description: "The official citywide flower festival programme.",
      },
    );

    expect(schema).toMatchObject({
      name: "11th Da Lat Flower Festival 2026",
      description: "The official citywide flower festival programme.",
      url: "https://dalat.app/events/da-lat-flower-festival-2026",
      eventStatus: "https://schema.org/EventScheduled",
      inLanguage: "en",
      location: {
        "@type": "Place",
        name: "Lâm Viên Square",
        address: {
          streetAddress: "Trần Quốc Toản, Phường Xuân Hương - Đà Lạt",
          addressLocality: "Đà Lạt",
          addressRegion: "Lâm Đồng",
          addressCountry: "VN",
        },
        geo: { latitude: 11.9404, longitude: 108.4583 },
      },
      image: {
        "@type": "ImageObject",
        name: "Flowers around Lâm Viên Square",
      },
    });
    expect(schema).not.toHaveProperty("offers");
  });

  it("never invents city-centre geo, a venue, or a free offer", () => {
    const schema = generateEventSchema(
      makeEvent({
        location_name: null,
        address: null,
        latitude: null,
        longitude: null,
        google_maps_url: null,
        price_type: "paid",
        ticket_tiers: null,
      }),
      "vi",
    );

    expect(schema.url).toBe(
      "https://dalat.app/vi/events/da-lat-flower-festival-2026",
    );
    expect(schema).not.toHaveProperty("location");
    expect(schema).not.toHaveProperty("offers");
  });

  it("publishes only explicit, valid ticket offers and sold-out state", () => {
    const schema = generateEventSchema(
      makeEvent({
        capacity: 100,
        price_type: "paid",
        ticket_tiers: [
          { name: "General admission", price: 150_000, currency: "vnd" },
          { name: "", price: -1, currency: "VND" },
        ],
      }),
      "en",
      100,
    );

    expect(schema.offers).toEqual([
      {
        "@type": "Offer",
        name: "General admission",
        price: 150_000,
        priceCurrency: "VND",
        availability: "https://schema.org/SoldOut",
        url: "https://dalat.app/events/da-lat-flower-festival-2026",
      },
    ]);
    expect(schema).toMatchObject({
      maximumAttendeeCapacity: 100,
      remainingAttendeeCapacity: 0,
    });
  });

  it("does not invent ticket availability when capacity state is unknown", () => {
    const schema = generateEventSchema(makeEvent({ price_type: "free" }), "en");

    expect(schema.offers).toEqual({
      "@type": "Offer",
      price: 0,
      priceCurrency: "VND",
      url: "https://dalat.app/events/da-lat-flower-festival-2026",
    });
  });

  it("uses explicit cancellation, never age, for EventCancelled status", () => {
    const cancelled = generateEventSchema(
      makeEvent({
        status: "cancelled",
        price_type: "free",
      }),
      "en",
    );
    expect(cancelled.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(cancelled).not.toHaveProperty("offers");

    const archived = generateEventSchema(makeEvent(), "en");
    expect(archived.eventStatus).toBe("https://schema.org/EventScheduled");
  });

  it("maps only explicit rescheduled or postponed state", () => {
    const rescheduled = generateEventSchema(
      makeEvent({
        is_exception: true,
        exception_type: "rescheduled",
      }),
      "en",
    );
    expect(rescheduled.eventStatus).toBe("https://schema.org/EventRescheduled");
    expect(rescheduled).not.toHaveProperty("previousStartDate");

    // The current DB constraint has no postponed status yet, but preserve
    // truthful schema behavior if that explicit lifecycle value is introduced.
    const postponed = generateEventSchema(
      makeEvent({
        status: "postponed" as Event["status"],
      }),
      "en",
    );
    expect(postponed.eventStatus).toBe("https://schema.org/EventPostponed");
  });

  it("uses canonical vanity organizer URLs without leaking RSVP-only meeting links", () => {
    const organizer = {
      slug: "da-lat-tourism",
      name: "Da Lat Tourism",
      logo_url: null,
    } as Organizer;
    const schema = generateEventSchema(
      {
        ...makeEvent({
          is_online: true,
          online_link: "https://meet.example/festival",
        }),
        organizers: organizer,
      },
      "fr",
    );

    expect(schema).toMatchObject({
      eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode",
      location: {
        "@type": "Place",
        name: "Lâm Viên Square",
      },
      organizer: {
        url: "https://dalat.app/fr/da-lat-tourism",
      },
    });
    expect(JSON.stringify(schema)).not.toContain("meet.example");
  });
});

describe("generateBreadcrumbSchema", () => {
  it("honors unprefixed English and prefixed localized canonicals", () => {
    const items = [
      { name: "Home", url: "/" },
      { name: "Events", url: "/events/upcoming" },
    ];

    expect(generateBreadcrumbSchema(items, "en").itemListElement).toMatchObject(
      [
        { item: "https://dalat.app/" },
        { item: "https://dalat.app/events/upcoming" },
      ],
    );
    expect(generateBreadcrumbSchema(items, "vi").itemListElement).toMatchObject(
      [
        { item: "https://dalat.app/vi/" },
        { item: "https://dalat.app/vi/events/upcoming" },
      ],
    );
  });
});

describe("localized WebSite schema URLs", () => {
  it("keeps default-English schema URLs on non-redirecting root paths", () => {
    const website = generateWebSiteSchema("en");

    expect(website.url).toBe("https://dalat.app");
    expect(website.potentialAction.target.urlTemplate).toBe(
      "https://dalat.app/search/{search_term_string}",
    );
  });

  it("preserves locale prefixes for non-default languages", () => {
    const website = generateWebSiteSchema("vi");

    expect(website.url).toBe("https://dalat.app/vi");
    expect(website.potentialAction.target.urlTemplate).toBe(
      "https://dalat.app/vi/search/{search_term_string}",
    );
  });
});

const basePost: BlogPostFull = {
  id: "post-1",
  slug: "keep-this-url",
  title: "A sourced guide",
  story_content: "A factual article body.",
  technical_content: "Technical details.",
  cover_image_url: null,
  cover_image_alt: null,
  cover_image_description: null,
  cover_image_keywords: null,
  cover_image_colors: null,
  suggested_cta_url: null,
  suggested_cta_text: null,
  meta_description: "A factual description.",
  social_share_text: null,
  seo_keywords: ["Da Lat"],
  related_feature_slugs: [],
  version: null,
  source: "manual",
  published_at: "2026-08-20T00:00:00.000Z",
  created_at: "2026-08-19T00:00:00.000Z",
  category_slug: "guides",
  category_name: "Guides",
  like_count: 0,
};

describe("article structured-data canonicals", () => {
  it("keeps default-locale breadcrumb URLs off the redirecting /en prefix", () => {
    const schema = generateBreadcrumbSchema(
      [
        { name: "Home", url: "/" },
        { name: "News", url: "/news" },
        { name: "Story", url: "/blog/news/keep-this-url" },
      ],
      "en",
    );

    expect(schema.itemListElement.map((item) => item.item)).toEqual([
      "https://dalat.app/",
      "https://dalat.app/news",
      "https://dalat.app/blog/news/keep-this-url",
    ]);
  });

  it("uses the redirect-free English URL and the real publisher icon", () => {
    const schema = generateBlogArticleSchema(
      { ...basePost, updated_at: "2026-08-21T00:00:00.000Z" },
      "en",
    );

    expect(schema).toMatchObject({
      url: "https://dalat.app/blog/guides/keep-this-url",
      dateModified: "2026-08-21T00:00:00.000Z",
      mainEntityOfPage: {
        "@id": "https://dalat.app/blog/guides/keep-this-url",
      },
      publisher: {
        logo: {
          url: "https://dalat.app/android-chrome-512x512.png",
        },
      },
    });
  });

  it("keeps locale prefixes for non-default NewsArticle URLs", () => {
    const schema = generateNewsArticleSchema(
      {
        ...basePost,
        category_slug: "news",
        category_name: "DaLat News",
        updated_at: "2026-08-22T00:00:00.000Z",
        source_urls: [],
      },
      "vi",
    );

    expect(schema).toMatchObject({
      url: "https://dalat.app/vi/blog/news/keep-this-url",
      dateModified: "2026-08-22T00:00:00.000Z",
      mainEntityOfPage: {
        "@id": "https://dalat.app/vi/blog/news/keep-this-url",
      },
      publisher: {
        logo: {
          url: "https://dalat.app/android-chrome-512x512.png",
        },
      },
    });
  });

  it("keeps sourced legacy automation on its established non-News URL", () => {
    const schema = generateNewsArticleSchema(
      {
        ...basePost,
        slug: "established-guide-url",
        category_slug: "guides",
        source: "news_scrape",
        source_urls: [
          {
            url: "https://tuoitre.vn/story.htm",
            title: "Source story",
            publisher: "Tuổi Trẻ",
            published_at: "2026-08-20T00:00:00.000Z",
          },
        ],
      },
      "en",
    );

    expect(schema).toMatchObject({
      url: "https://dalat.app/blog/guides/established-guide-url",
      articleSection: "Guides",
      mainEntityOfPage: {
        "@id": "https://dalat.app/blog/guides/established-guide-url",
      },
    });
  });
});
