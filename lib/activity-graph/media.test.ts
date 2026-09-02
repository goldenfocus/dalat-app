import { describe, expect, it } from "vitest";
import {
  activityMediaMetadata,
  activityProjectionImage,
  projectedActivityMedia,
  sourceAllowsOfficialMedia,
} from "./media";
import type { ActivitySource, ExtractedActivity } from "./types";

const source = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "official-venue",
  name: "Official Venue",
  canonical_url: "https://events.example.com",
  discovery_url: null,
  page_path_prefix: "/shows/",
  source_kind: "first_party_venue",
  fetch_mode: "json_ld_sitemap",
  access_basis: "first_party_page",
  trust_tier: 1,
  policy_status: "approved",
  crawl_interval_minutes: 60,
  max_items_per_run: 25,
  status: "active",
  auto_publish_enabled: true,
  auto_publish_threshold: 95,
  organizer_id: null,
  venue_id: null,
  metadata: {
    media_policy: "official_source_embed",
    media_reuse_allowed: true,
    attribution_text: "Official Venue · official source",
  },
} satisfies ActivitySource;

const activity = {
  sourceUrl: "https://events.example.com/shows/acoustic",
  mediaCandidates: [
    {
      url: "https://events.example.com/images/gallery.webp",
      role: "gallery",
      sourceUrl: "https://events.example.com/shows/acoustic",
      locator: "html:img[0]",
    },
    {
      url: "https://cdn.events.example.com/images/poster.webp",
      role: "primary",
      sourceUrl: "https://events.example.com/shows/acoustic",
      locator: "jsonld:Event.image",
    },
  ],
} as ExtractedActivity;

describe("Activity Graph official media projection", () => {
  it("requires an explicit source-level media policy", () => {
    expect(
      sourceAllowsOfficialMedia({
        ...source,
        metadata: {
          media_policy: "reference_only",
          media_reuse_allowed: false,
        },
      }),
    ).toBe(false);
    expect(projectedActivityMedia(source, activity)?.url).toBe(
      "https://cdn.events.example.com/images/poster.webp",
    );
  });

  it("rejects third-party candidates even when the source is enabled", () => {
    expect(
      projectedActivityMedia(source, {
        ...activity,
        mediaCandidates: [
          {
            url: "https://images.example.net/copied-poster.webp",
            role: "primary",
            sourceUrl: activity.sourceUrl,
            locator: "jsonld:Event.image",
          },
        ],
      }),
    ).toBeNull();
  });

  it("replaces fact-art and rotates source-controlled images", () => {
    const media = projectedActivityMedia(source, activity)!;
    expect(
      activityProjectionImage({
        currentUrl: "https://dalat.app/activity-art/events/acoustic.png",
        currentMetadata: {},
        media,
        mediaAllowed: true,
      }),
    ).toBe(media.url);
    expect(
      activityProjectionImage({
        currentUrl: "https://events.example.com/images/old.webp",
        currentMetadata: {
          activity_media_url: "https://events.example.com/images/old.webp",
        },
        media,
        mediaAllowed: true,
      }),
    ).toBe(media.url);
    expect(activityMediaMetadata(media)).toMatchObject({
      activity_media_url: media.url,
      activity_media_attribution: "Official Venue · official source",
    });
  });

  it("preserves organizer uploads but revokes tracked official media", () => {
    expect(
      activityProjectionImage({
        currentUrl: "https://cdn.dalat.app/organizer/custom.webp",
        currentMetadata: {},
        media: projectedActivityMedia(source, activity),
        mediaAllowed: true,
      }),
    ).toBe("https://cdn.dalat.app/organizer/custom.webp");
    expect(
      activityProjectionImage({
        currentUrl: "https://events.example.com/images/poster.webp",
        currentMetadata: {
          activity_media_url: "https://events.example.com/images/poster.webp",
        },
        media: null,
        mediaAllowed: false,
      }),
    ).toBeNull();
    expect(
      activityProjectionImage({
        currentUrl: "https://dalat.app/activity-art/events/acoustic.png",
        currentMetadata: {},
        media: null,
        mediaAllowed: false,
      }),
    ).toBeNull();
  });
});
