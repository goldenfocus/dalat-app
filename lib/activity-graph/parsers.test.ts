import { describe, expect, it } from "vitest";
import {
  extractDuoiTanAcoustic,
  extractSchemaOrgEvents,
  parseSitemap,
} from "./parsers";

describe("Activity Graph deterministic parsers", () => {
  it("extracts a first-party schema.org Event without inventing unknown fields", () => {
    const html = `
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Event","name":"Đêm nhạc Đà Lạt",
       "startDate":"2026-09-02T19:30:00+07:00","endDate":"2026-09-02T21:30:00+07:00",
       "eventStatus":"https://schema.org/EventScheduled",
       "image":"/_astro/official-poster.webp",
       "location":{"@type":"Place","name":"Mây Lang Thang - Đà Lạt","address":"Đà Lạt, Lâm Đồng"},
       "organizer":{"@type":"Organization","name":"Mây Lang Thang","url":"/"},
       "url":"/shows/dem-nhac","offers":[{"@type":"Offer","price":"250000","priceCurrency":"VND","url":"/shows/dem-nhac"}]}
      </script>`;

    const [activity] = extractSchemaOrgEvents(
      html,
      "https://maylangthang.com.vn/shows/dem-nhac",
      "2026-08-28",
    );

    expect(activity).toMatchObject({
      sourceUid: "https://maylangthang.com.vn/shows/dem-nhac",
      sourceUrl: "https://maylangthang.com.vn/shows/dem-nhac",
      kind: "performance",
      title: "Đêm nhạc Đà Lạt",
      timePrecision: "exact",
      locationName: "Mây Lang Thang - Đà Lạt",
      address: "Đà Lạt, Lâm Đồng",
      organizerName: "Mây Lang Thang",
      priceType: "paid",
      publicAccess: "confirmed",
      eventStatus: "scheduled",
      latitude: null,
      longitude: null,
    });
    expect(activity.ticketTiers).toEqual([
      { name: "Official ticket 1", price: 250000, currency: "VND" },
    ]);
    expect(activity.evidence.map((row) => row.fieldPath)).toContain(
      "starts_at",
    );
    expect(activity.structuredPayload).not.toHaveProperty("description");
    expect(activity.mediaCandidates).toEqual([
      {
        url: "https://maylangthang.com.vn/_astro/official-poster.webp",
        role: "primary",
        sourceUrl: "https://maylangthang.com.vn/shows/dem-nhac",
        locator: "jsonld:Event[0].image[0]",
      },
    ]);
    expect(activity.structuredPayload).toHaveProperty("mediaCandidates");
  });

  it("interprets offset-less schema.org datetimes in Asia/Ho_Chi_Minh", () => {
    const [activity] = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"Local Night","startDate":"2026-09-02T19:30:00","endDate":"2026-09-02T21:30:00","url":"/local-night"}</script>`,
      "https://events.example.com/calendar",
    );

    expect(activity).toMatchObject({
      startsAt: "2026-09-02T12:30:00.000Z",
      endsAt: "2026-09-02T14:30:00.000Z",
      durationMinutes: 120,
      timezone: "Asia/Ho_Chi_Minh",
    });
  });

  it("preserves the instant expressed by an explicit schema.org offset", () => {
    const [activity] = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"Touring Show","startDate":"2026-09-02T19:30:00+09:00","url":"/touring-show"}</script>`,
      "https://events.example.com/calendar",
    );

    expect(activity.startsAt).toBe("2026-09-02T10:30:00.000Z");
    expect(activity.sourceUid).toBe("https://events.example.com/touring-show");
  });

  it("keeps a unique canonical identity stable when an official schedule changes", () => {
    const before = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"Night Show","startDate":"2026-09-02T19:30:00+07:00","url":"/night-show"}</script>`,
      "https://events.example.com/calendar",
    )[0];
    const after = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"Night Show","startDate":"2026-09-02T20:30:00+07:00","url":"/night-show"}</script>`,
      "https://events.example.com/calendar",
    )[0];

    expect(before.sourceUid).toBe("https://events.example.com/night-show");
    expect(after.sourceUid).toBe(before.sourceUid);
    expect(after.startsAt).not.toBe(before.startsAt);
  });

  it("withholds schema.org datetimes that cannot be interpreted safely", () => {
    const activities = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"Ambiguous Night","startDate":"September 2, 2026 at 7:30 PM","url":"/ambiguous"}</script>`,
      "https://events.example.com/calendar",
    );

    expect(activities).toEqual([]);
  });

  it("withholds an event whose explicit end is not after its start", () => {
    const activities = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"Broken Night","startDate":"2026-09-02T21:30:00+07:00","endDate":"2026-09-02T19:30:00+07:00","url":"/broken"}</script>`,
      "https://events.example.com/calendar",
    );

    expect(activities).toEqual([]);
  });

  it("derives distinct stable keys for multiple Event objects on one page", () => {
    const activities = extractSchemaOrgEvents(
      `<script type="application/ld+json">[
        {"@type":"Event","@id":"#night-show","name":"Early Show","startDate":"2026-09-02T18:00:00+07:00","url":"/calendar"},
        {"@type":"Event","@id":"#night-show","name":"Late Show","startDate":"2026-09-02T21:00:00+07:00","url":"/calendar"}
      ]</script>`,
      "https://events.example.com/calendar",
    );

    expect(activities.map((activity) => activity.sourceUid)).toEqual([
      "https://events.example.com/calendar#night-show::2026-09-02T11:00:00.000Z",
      "https://events.example.com/calendar#night-show::2026-09-02T14:00:00.000Z",
    ]);
    expect(
      new Set(activities.map((activity) => activity.sourceUid)),
    ).toHaveLength(2);
  });

  it("rejects duplicate Event identity and start-date keys", () => {
    const activities = extractSchemaOrgEvents(
      `<script type="application/ld+json">[
        {"@type":"Event","@id":"#same-show","name":"Duplicate A","startDate":"2026-09-02T19:00:00+07:00","url":"/calendar"},
        {"@type":"Event","@id":"#same-show","name":"Duplicate B","startDate":"2026-09-02T19:00:00+07:00","url":"/calendar"}
      ]</script>`,
      "https://events.example.com/calendar",
    );

    expect(activities).toEqual([]);
  });

  it("keeps unknown pricing null when Event offers are absent", () => {
    const [activity] = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"Art Night","startDate":"2026-09-02T19:30:00+07:00","eventStatus":"https://schema.org/EventScheduled","location":{"name":"Đà Lạt"},"url":"/art"}</script>`,
      "https://example.com/art",
    );
    expect(activity.priceType).toBeNull();
    expect(activity.ticketTiers).toBeNull();
    expect(activity.publicAccess).toBe("unknown");
  });

  it("does not mislabel Mây Lang Thang's 25,000 VND shuttle as a ticket", () => {
    const [activity] = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"HÀ NHI - ĐÀ LẠT","startDate":"2026-08-30T17:00:00+07:00","eventStatus":"https://schema.org/EventScheduled","location":{"name":"MÂY LANG THANG - ĐÀ LẠT"},"url":"/shows/hanhi3008","offers":[{"@type":"Offer","price":"25000","priceCurrency":"VND","url":"/shows/hanhi3008"},{"@type":"Offer","price":"2500000","priceCurrency":"VND","url":"/shows/hanhi3008"}]}</script>`,
      "https://maylangthang.com.vn/shows/hanhi3008",
    );

    expect(activity.ticketTiers).toEqual([
      {
        name: "Official ticket 1",
        price: 2_500_000,
        currency: "VND",
      },
    ]);
    expect(activity.ticketTiers?.some((tier) => tier.price === 25_000)).toBe(
      false,
    );
  });

  it("does not turn null prices or coordinates into factual zeroes", () => {
    const [activity] = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"Unknown Details","startDate":"2026-09-02T19:30:00+07:00","eventStatus":"https://schema.org/EventScheduled","location":{"name":"Đà Lạt","geo":{"latitude":null,"longitude":""}},"url":"/unknown","offers":{"price":null,"priceCurrency":"VND","url":"/unknown"}}</script>`,
      "https://example.com/unknown",
    );

    expect(activity.priceType).toBeNull();
    expect(activity.ticketTiers).toBeNull();
    expect(activity.latitude).toBeNull();
    expect(activity.longitude).toBeNull();
  });

  it("does not expose non-HTTPS or credential-bearing source links", () => {
    const [activity] = extractSchemaOrgEvents(
      `<script type="application/ld+json">{"@type":"Event","name":"Unsafe Link","startDate":"2026-09-02T19:30:00+07:00","eventStatus":"https://schema.org/EventScheduled","location":{"name":"Đà Lạt"},"url":"javascript:alert(1)","offers":{"price":"100000","url":"https://user:pass@example.com/ticket"}}</script>`,
      "https://example.com/calendar",
    );

    expect(activity.sourceUrl).toBe("https://example.com/calendar");
    expect(activity.ticketUrl).toBe("https://example.com/calendar");
    expect(activity.publicAccess).toBe("unknown");
  });

  it("parses only same-origin sitemap pages under the approved prefix", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://maylangthang.com.vn/shows/a</loc><lastmod>2026-08-28</lastmod></url>
      <url><loc>https://maylangthang.com.vn/blog/not-an-event</loc></url>
      <url><loc>https://attacker.example/shows/b</loc></url>
    </urlset>`;
    expect(
      parseSitemap(xml, "https://maylangthang.com.vn", "/shows/", 25),
    ).toEqual([
      {
        url: "https://maylangthang.com.vn/shows/a",
        lastModified: "2026-08-28",
      },
    ]);
  });

  it("extracts the explicitly stated nightly acoustic schedule as recurrence", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"Restaurant","name":"Dưới Tán Anh Đào","url":"https://duoitananhdao.com/en/",
       "address":{"streetAddress":"29B Hùng Vương, Xuân Trường","addressLocality":"Đà Lạt","addressRegion":"Lâm Đồng","addressCountry":"VN"}}
      </script>
      <img src="/images/dishes/acoustic.webp" alt="Acoustic night photo" />
      <img data-full="/images/dishes/dtad-07.webp" alt="Valley-facing stage" />
      <img src="/images/unrelated-food.webp" alt="Food" />
      <script type="application/ld+json">
      {"@type":"FAQPage","mainEntity":[
        {"@type":"Question","name":"When is the live acoustic set?","acceptedAnswer":{"@type":"Answer","text":"Live acoustic runs every evening from 7:30pm to 9:30pm. There is no ticket and no cover charge."}},
        {"@type":"Question","name":"What are the hours?","acceptedAnswer":{"@type":"Answer","text":"Booking is advisable at weekends and in high season."}},
        {"@type":"Question","name":"Does it happen when it rains?","acceptedAnswer":{"@type":"Answer","text":"Yes. The set runs as usual and we do not cancel because of weather."}}
      ]}
      </script>`;
    const [activity] = extractDuoiTanAcoustic(
      html,
      "https://duoitananhdao.com/en/",
      new Date("2026-08-28T01:00:00Z"),
    );

    expect(activity).toMatchObject({
      sourceUid: "nightly-acoustic",
      kind: "recurring_activity",
      rrule: "FREQ=DAILY",
      startsAtTime: "19:30:00",
      durationMinutes: 120,
      address: "29B Hùng Vương, Xuân Trường, Đà Lạt, Lâm Đồng, VN",
      reservationRequirement: "recommended",
      priceType: null,
      publicAccess: "confirmed",
    });
    expect(activity.attributes).toMatchObject({
      rain_suitable: true,
      no_cover_charge: true,
    });
    expect(activity.mediaCandidates).toHaveLength(2);
    expect(activity.mediaCandidates?.map(({ url }) => url)).toEqual([
      "https://duoitananhdao.com/images/dishes/acoustic.webp",
      "https://duoitananhdao.com/images/dishes/dtad-07.webp",
    ]);
  });

  it("fails closed when recurring schedule wording no longer contains explicit times", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Restaurant","name":"Dưới Tán Anh Đào","address":"Đà Lạt"}</script>
      <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"name":"Live acoustic","acceptedAnswer":{"text":"Music on selected evenings."}}]}</script>`;
    expect(
      extractDuoiTanAcoustic(html, "https://duoitananhdao.com/en/"),
    ).toEqual([]);
  });
});
