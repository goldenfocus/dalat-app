import { describe, expect, it } from "vitest";
import { evaluateDraftQuality, type ReviewEventSnapshot } from "./review-gate";

const now = new Date("2026-09-11T05:00:00.000Z");

function event(overrides: Partial<ReviewEventSnapshot> = {}): ReviewEventSnapshot {
  return {
    id: "evt-1",
    slug: "sunset-hike",
    title: "Sunset hike Langbiang",
    description: "Canonical facts from source: 20 Sep 19:00 at Langbiang, Đà Lạt.",
    starts_at: "2026-09-20T12:00:00.000Z",
    ends_at: null,
    location_name: "Langbiang, Đà Lạt",
    address: "Lạc Dương, Lâm Đồng",
    venue_id: null,
    is_online: false,
    online_link: null,
    image_url: "https://cdn.dalat.app/event-media/hike.jpg",
    image_alt: "Event image from the organizer or venue source.",
    external_chat_url: "https://ticketbox.vn/event/sunset-hike",
    tribe_id: null,
    tribe_visibility: null,
    source_locale: "en",
    source_platform: "scout",
    source_metadata: { source_url: "https://ticketbox.vn/event/sunset-hike" },
    status: "draft",
    updated_at: "2026-09-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("evaluateDraftQuality", () => {
  it("passes a complete Đà Lạt draft", () => {
    expect(evaluateDraftQuality(event(), { publishedDuplicate: false, now })).toEqual([]);
  });

  it("keeps Activity Graph events out of this lane", () => {
    const reasons = evaluateDraftQuality(
      event({ source_platform: "activity-graph" }),
      { publishedDuplicate: false, now },
    );
    expect(reasons.map((reason) => reason.code)).toContain("activity_graph_lane");
  });

  it("fails junk / non-local events", () => {
    const reasons = evaluateDraftQuality(
      event({
        title: "HCMC rooftop party",
        description: "District 1 only",
        location_name: "Saigon",
        address: "D1",
      }),
      { publishedDuplicate: false, now },
    );
    expect(reasons.map((reason) => reason.code)).toContain("not_dalat_locality");
  });

  it("fails a missing hero unless a visual gap is documented", () => {
    const missing = evaluateDraftQuality(
      event({ image_url: null }),
      { publishedDuplicate: false, now },
    );
    expect(missing.map((reason) => reason.code)).toContain("missing_image");

    const documented = evaluateDraftQuality(
      event({
        image_url: null,
        source_metadata: {
          source_url: "https://ticketbox.vn/event/sunset-hike",
          visual_gap: { reason: "Organizer page has no reusable image" },
        },
      }),
      { publishedDuplicate: false, now },
    );
    expect(documented.map((reason) => reason.code)).not.toContain("missing_image");
  });

  it("accepts WhatsApp message provenance without a web URL", () => {
    const reasons = evaluateDraftQuality(
      event({
        external_chat_url: "whatsapp:120363@g.us/ABCD",
        source_platform: "whatsapp",
        source_metadata: { message_id: "ABCD", group_jid: "120363@g.us" },
      }),
      { publishedDuplicate: false, now },
    );
    expect(reasons.map((reason) => reason.code)).not.toContain("missing_source");
  });

  it("flags a published duplicate", () => {
    const reasons = evaluateDraftQuality(event(), {
      publishedDuplicate: true,
      now,
    });
    expect(reasons.map((reason) => reason.code)).toContain("duplicate_published");
  });
});
