import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  triggerTranslationServer: vi.fn(async () => ({ ok: true, localesWritten: 0 })),
}));

vi.mock("@/lib/translations", () => ({
  triggerTranslationServer: mocks.triggerTranslationServer,
}));

import {
  evaluateDraftQuality,
  publishReviewEvent,
  type ReviewEventSnapshot,
} from "./review-gate";

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

function mockSupabase(options: { duplicate?: boolean } = {}) {
  const updates: unknown[] = [];
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.update = vi.fn((row: unknown) => {
      updates.push(row);
      return builder;
    });
    builder.eq = vi.fn(chain);
    builder.neq = vi.fn(chain);
    builder.ilike = vi.fn(chain);
    builder.gte = vi.fn(chain);
    builder.lt = vi.fn(chain);
    builder.limit = vi.fn(chain);
    builder.maybeSingle = vi.fn(async () => ({
      data: options.duplicate ? { id: "other" } : null,
      error: null,
    }));
    builder.then = (
      resolve: (value: { data: unknown; error: null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
    return builder;
  });
  return { from, updates };
}

describe("publishReviewEvent translation trigger", () => {
  beforeEach(() => {
    mocks.triggerTranslationServer.mockClear();
  });

  it("awaits triggerTranslationServer once after a successful publish", async () => {
    const draft = event();
    const supabase = mockSupabase();

    const result = await publishReviewEvent(supabase as never, draft, { now });

    expect(result).toMatchObject({
      passed: true,
      published: true,
      event: { id: draft.id, status: "published" },
    });
    expect(supabase.updates[0]).toMatchObject({
      status: "published",
      source_locale: "en",
      updated_at: now.toISOString(),
    });
    expect(mocks.triggerTranslationServer).toHaveBeenCalledOnce();
    expect(mocks.triggerTranslationServer).toHaveBeenCalledWith("event", draft.id, [
      { field_name: "title", text: draft.title },
      { field_name: "description", text: draft.description },
    ]);
  });

  it("persists an inferred source_locale when the draft stored null", async () => {
    const supabase = mockSupabase();
    const draft = event({
      source_locale: null,
      title: "Hà Nhi live in Dalat tại La Maritza",
      description: "Đêm nhạc tại Đà Lạt. Canonical facts from the organizer page.",
    });

    const result = await publishReviewEvent(supabase as never, draft, { now });

    expect(result.published).toBe(true);
    expect(supabase.updates[0]).toMatchObject({
      status: "published",
      source_locale: "vi",
      updated_at: now.toISOString(),
    });
    expect(mocks.triggerTranslationServer).toHaveBeenCalledOnce();
  });

  it("does not trigger translation when evaluate fails", async () => {
    const supabase = mockSupabase();
    const result = await publishReviewEvent(
      supabase as never,
      event({
        title: "HCMC rooftop party",
        description: "District 1 only",
        location_name: "Saigon",
        address: "D1",
      }),
      { now },
    );

    expect(result.published).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("not_dalat_locality");
    expect(supabase.updates).toHaveLength(0);
    expect(mocks.triggerTranslationServer).not.toHaveBeenCalled();
  });

  it("does not trigger translation when the event is not a draft", async () => {
    const supabase = mockSupabase();
    const result = await publishReviewEvent(
      supabase as never,
      event({ status: "published" }),
      { now },
    );

    expect(result).toMatchObject({
      passed: false,
      published: false,
      reasons: [{ code: "not_a_draft" }],
    });
    expect(supabase.updates).toHaveLength(0);
    expect(mocks.triggerTranslationServer).not.toHaveBeenCalled();
  });
});
