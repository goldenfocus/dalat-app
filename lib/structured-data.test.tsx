import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Event, EventSeries } from "@/lib/types";
import {
  generateEventSchema,
  generateEventSeriesSchema,
  JsonLd,
} from "@/lib/structured-data";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    slug: "truthful-event",
    title: "Truthful event",
    description: "A grounded event description.",
    starts_at: "2099-08-28T19:30:00+07:00",
    ends_at: null,
    status: "published",
    location_name: "Verified venue",
    address: "1 Example Street",
    google_maps_url: null,
    latitude: null,
    longitude: null,
    is_online: false,
    price_type: null,
    ticket_tiers: null,
    capacity: null,
    created_at: "2026-08-27T00:00:00Z",
    ...overrides,
  } as Event;
}

describe("JsonLd", () => {
  it("escapes less-than characters so data cannot terminate the script", () => {
    const attack = "</script><script>window.pwned = true</script>";
    const { container } = render(<JsonLd data={{ name: attack }} />);
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );

    expect(script?.textContent).not.toContain("</script>");
    expect(script?.textContent).toContain("\\u003c/script>");
    expect(JSON.parse(script?.textContent ?? "{}").name).toBe(attack);
  });
});

describe("generateEventSchema", () => {
  it("uses the unprefixed canonical URL for English", () => {
    expect(generateEventSchema(makeEvent(), "en").url).toBe(
      "https://dalat.app/events/truthful-event",
    );
  });

  it("keeps past published events scheduled and preserves explicit cancellation", () => {
    const pastEvent = makeEvent({ starts_at: "2020-01-01T19:30:00+07:00" });
    const cancelledEvent = makeEvent({
      starts_at: "2020-01-01T19:30:00+07:00",
      status: "cancelled",
    });

    expect(generateEventSchema(pastEvent, "en").eventStatus).toBe(
      "https://schema.org/EventScheduled",
    );
    expect(generateEventSchema(cancelledEvent, "en").eventStatus).toBe(
      "https://schema.org/EventCancelled",
    );
  });

  it("omits offers when pricing is unknown", () => {
    const schema = generateEventSchema(
      makeEvent({ price_type: null, ticket_tiers: null }),
      "en",
    );

    expect(schema).not.toHaveProperty("offers");
  });

  it("emits actual coordinates and omits geo when coordinates are unknown", () => {
    const located = generateEventSchema(
      makeEvent({ latitude: 11.9551, longitude: 108.4512 }),
      "en",
    );
    const unknown = generateEventSchema(
      makeEvent({ latitude: null, longitude: null }),
      "en",
    );

    expect(located.location).toMatchObject({
      geo: {
        "@type": "GeoCoordinates",
        latitude: 11.9551,
        longitude: 108.4512,
      },
    });
    expect(unknown.location).not.toHaveProperty("geo");
  });

  it("uses online and mixed attendance modes when the event data says so", () => {
    const online = generateEventSchema(
      makeEvent({
        is_online: true,
        location_name: null,
        address: null,
        google_maps_url: null,
      }),
      "en",
    );
    const mixed = generateEventSchema(makeEvent({ is_online: true }), "en");

    expect(online.eventAttendanceMode).toBe(
      "https://schema.org/OnlineEventAttendanceMode",
    );
    expect(mixed.eventAttendanceMode).toBe(
      "https://schema.org/MixedEventAttendanceMode",
    );
  });
});

function makeSeries(overrides: Partial<EventSeries> = {}): EventSeries {
  return {
    id: "series-1",
    slug: "nightly-acoustic",
    title: "Nightly acoustic",
    description: "A recurring local activity.",
    image_url: null,
    location_name: "Verified venue",
    address: "29B Example Street",
    google_maps_url: null,
    latitude: null,
    longitude: null,
    external_chat_url: null,
    timezone: "Asia/Ho_Chi_Minh",
    capacity: null,
    is_online: false,
    online_link: null,
    title_position: "bottom",
    image_fit: "cover",
    focal_point: null,
    price_type: null,
    ticket_tiers: null,
    tribe_id: null,
    organizer_id: null,
    created_by: "profile-1",
    rrule: "FREQ=DAILY",
    starts_at_time: "19:30:00",
    duration_minutes: 120,
    first_occurrence: "2026-08-28",
    rrule_until: null,
    rrule_count: null,
    status: "active",
    instances_generated_until: null,
    created_at: "2026-08-28T00:00:00Z",
    updated_at: "2026-08-28T00:00:00Z",
    ...overrides,
  };
}

describe("generateEventSeriesSchema", () => {
  it("uses canonical locale URLs and omits invented geo and pricing", () => {
    const schema = generateEventSeriesSchema(makeSeries(), "en");

    expect(schema.url).toBe("https://dalat.app/series/nightly-acoustic");
    expect(schema).not.toHaveProperty("offers");
    expect(schema).not.toHaveProperty("isAccessibleForFree");
    expect(schema.location).not.toHaveProperty("geo");
  });

  it("emits only actual coordinates and explicit ticket tiers", () => {
    const schema = generateEventSeriesSchema(
      makeSeries({
        latitude: 11.9551,
        longitude: 108.4512,
        price_type: "paid",
        ticket_tiers: [{ name: "Door", price: 150000, currency: "VND" }],
      }),
      "vi",
    );

    expect(schema.url).toBe("https://dalat.app/vi/series/nightly-acoustic");
    expect(schema.location).toMatchObject({
      geo: { latitude: 11.9551, longitude: 108.4512 },
    });
    expect(schema.offers).toEqual([
      expect.objectContaining({
        name: "Door",
        price: 150000,
        priceCurrency: "VND",
      }),
    ]);
    expect(schema.isAccessibleForFree).toBe(false);
  });
});
