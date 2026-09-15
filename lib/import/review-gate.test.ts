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
  qaReviewEvent,
  rejectReviewEvent,
  type ReviewEventSnapshot,
} from "./review-gate";
import { reviewIngestSchema } from "./scout-schema";

const now = new Date("2026-09-11T05:00:00.000Z");

describe("reviewIngestSchema", () => {
  it("accepts evaluate, publish, qa, and reject", () => {
    expect(reviewIngestSchema.safeParse({ action: "evaluate", slug: "x" }).success).toBe(true);
    expect(reviewIngestSchema.safeParse({ action: "publish", id: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
    expect(reviewIngestSchema.safeParse({ action: "qa", slug: "x" }).success).toBe(true);
    expect(
      reviewIngestSchema.safeParse({
        action: "reject",
        slug: "x",
        reasons: ["Wrong city night time"],
      }).success,
    ).toBe(true);
  });

  it("requires reasons for reject", () => {
    const parsed = reviewIngestSchema.safeParse({ action: "reject", slug: "x" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.path.includes("reasons"))).toBe(true);
  });
});

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

function qualityOptions(
  overrides: { publishedDuplicate?: boolean; promoCount?: number } = {},
) {
  return {
    publishedDuplicate: overrides.publishedDuplicate ?? false,
    now,
    promoCount: overrides.promoCount ?? 2,
  };
}

describe("evaluateDraftQuality", () => {
  it("passes a complete Đà Lạt draft", () => {
    expect(evaluateDraftQuality(event(), qualityOptions())).toEqual([]);
  });

  it("keeps Activity Graph events out of this lane", () => {
    const reasons = evaluateDraftQuality(
      event({ source_platform: "activity-graph" }),
      qualityOptions(),
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
      qualityOptions(),
    );
    expect(reasons.map((reason) => reason.code)).toContain("not_dalat_locality");
  });

  it("fails a missing hero unless a visual gap is documented", () => {
    const missing = evaluateDraftQuality(
      event({ image_url: null }),
      qualityOptions(),
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
      qualityOptions({ promoCount: 0 }),
    );
    expect(documented.map((reason) => reason.code)).not.toContain("missing_image");
    expect(documented.map((reason) => reason.code)).not.toContain("missing_promo");
  });

  it("fails a missing promo gallery unless a visual gap is documented", () => {
    const missing = evaluateDraftQuality(event(), qualityOptions({ promoCount: 0 }));
    expect(missing.map((reason) => reason.code)).toContain("missing_promo");

    const documented = evaluateDraftQuality(
      event({
        source_metadata: {
          source_url: "https://ticketbox.vn/event/sunset-hike",
          visual_gap: {
            reason: "Organizer posted only one reusable image",
            covers: ["promo"],
          },
        },
      }),
      qualityOptions({ promoCount: 0 }),
    );
    expect(documented.map((reason) => reason.code)).not.toContain("missing_promo");
  });

  it("accepts WhatsApp message provenance without a web URL", () => {
    const reasons = evaluateDraftQuality(
      event({
        external_chat_url: "whatsapp:120363@g.us/ABCD",
        source_platform: "whatsapp",
        source_metadata: { message_id: "ABCD", group_jid: "120363@g.us" },
      }),
      qualityOptions(),
    );
    expect(reasons.map((reason) => reason.code)).not.toContain("missing_source");
  });

  it("flags a published duplicate", () => {
    const reasons = evaluateDraftQuality(event(), qualityOptions({ publishedDuplicate: true }));
    expect(reasons.map((reason) => reason.code)).toContain("duplicate_published");
  });
});

function mockSupabase(
  options: {
    duplicate?: boolean;
    promoCount?: number;
    promoRows?: Array<Record<string, unknown>>;
    translationRows?: Array<Record<string, unknown>>;
  } = {},
) {
  const updates: unknown[] = [];
  const from = vi.fn((table: string) => {
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
    builder.in = vi.fn(chain);
    builder.limit = vi.fn(chain);
    builder.maybeSingle = vi.fn(async () => ({
      data: options.duplicate ? { id: "other" } : null,
      error: null,
    }));
    builder.then = (
      resolve: (value: { data: unknown; count: number | null; error: null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => {
      if (table === "promo_media") {
        return Promise.resolve({
          data: options.promoRows ?? [],
          count: options.promoCount ?? options.promoRows?.length ?? 2,
          error: null,
        }).then(resolve, reject);
      }
      if (table === "content_translations") {
        return Promise.resolve({
          data: options.translationRows ?? [],
          count: options.translationRows?.length ?? 0,
          error: null,
        }).then(resolve, reject);
      }
      return Promise.resolve({ data: null, count: null, error: null }).then(resolve, reject);
    };
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
      source_metadata: expect.objectContaining({
        review_result: "published",
        translation_needed_at: now.toISOString(),
        needs_review: false,
      }),
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

describe("rejectReviewEvent", () => {
  it("persists structured reject reasons on the draft without publishing", async () => {
    const supabase = mockSupabase();
    const draft = event();

    const result = await rejectReviewEvent(
      supabase as never,
      draft,
      ["Wrong city night time", "Near-duplicate of an existing listing"],
      { now },
    );

    expect(result).toMatchObject({
      rejected: true,
      event: { id: draft.id, status: "draft" },
    });
    expect(result.reasons).toEqual([
      { message: "Wrong city night time" },
      { message: "Near-duplicate of an existing listing" },
    ]);
    expect(supabase.updates[0]).toMatchObject({
      source_metadata: {
        source_url: "https://ticketbox.vn/event/sunset-hike",
        needs_review: false,
        review_result: "rejected",
        rejected_at: now.toISOString(),
        reject_reasons: [
          "Wrong city night time",
          "Near-duplicate of an existing listing",
        ],
      },
      updated_at: now.toISOString(),
    });
    expect(supabase.updates[0]).not.toMatchObject({ status: "published" });
    expect(mocks.triggerTranslationServer).not.toHaveBeenCalled();
  });

  it("does not reject a published event", async () => {
    const supabase = mockSupabase();
    const result = await rejectReviewEvent(
      supabase as never,
      event({ status: "published" }),
      ["Already live"],
      { now },
    );

    expect(result).toMatchObject({
      rejected: false,
      reasons: [{ code: "not_a_draft" }],
    });
    expect(supabase.updates).toHaveLength(0);
  });
});

describe("qaReviewEvent images", () => {
  it("fails missing_promo when the gallery is empty and no gap is documented", async () => {
    const result = await qaReviewEvent(
      mockSupabase({ promoCount: 0, promoRows: [] }) as never,
      event(),
    );
    expect(result.images.passed).toBe(false);
    expect(result.images.promoCount).toBe(0);
    expect(result.images.gaps.map((gap) => gap.code)).toContain("missing_promo");
  });

  it("covers a missing promo gallery when hero exists and visual_gap documents it", async () => {
    const result = await qaReviewEvent(
      mockSupabase({ promoCount: 0, promoRows: [] }) as never,
      event({
        source_metadata: {
          source_url: "https://ticketbox.vn/event/sunset-hike",
          visual_gap: {
            reason: "Organizer posted only one reusable image",
            covers: ["promo"],
          },
        },
      }),
    );
    expect(result.images.heroPresent).toBe(true);
    expect(result.images.promoCount).toBe(0);
    expect(result.images.gaps.map((gap) => gap.code)).not.toContain("missing_promo");
    expect(result.images.gaps.map((gap) => gap.code)).not.toContain("documented_visual_gap");
    expect(result.images.passed).toBe(true);
  });
});
