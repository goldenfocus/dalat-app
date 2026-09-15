import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  triggerTranslationServer: vi.fn(async () => ({ ok: true, localesWritten: 0 })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/translations", () => ({
  triggerTranslationServer: mocks.triggerTranslationServer,
}));

import { POST } from "./route";

const draft = {
  id: "11111111-1111-4111-8111-111111111111",
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
};

function request(body: unknown, header?: string) {
  return new Request("http://localhost/api/import/review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(header ? { Authorization: header } : {}),
    },
    body: JSON.stringify(body),
  });
}

function mockSupabase(event: typeof draft | null, options: { duplicate?: boolean } = {}) {
  const updates: unknown[] = [];
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.update = vi.fn((row: unknown) => {
      updates.push({ table, row });
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    });
    builder.neq = vi.fn(chain);
    builder.ilike = vi.fn(chain);
    builder.gte = vi.fn(chain);
    builder.lt = vi.fn(chain);
    builder.in = vi.fn(chain);
    builder.limit = vi.fn(chain);
    builder.maybeSingle = vi.fn(async () => {
      if (table === "events" && (filters.id || filters.slug)) {
        return { data: event, error: null };
      }
      if (table === "events") {
        return { data: options.duplicate ? { id: "other" } : null, error: null };
      }
      return { data: null, error: null };
    });
    builder.then = (
      resolve: (value: { data: unknown; count: number | null; error: null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => {
      if (table === "promo_media") {
        return Promise.resolve({ data: [], count: 2, error: null }).then(resolve, reject);
      }
      if (table === "content_translations") {
        return Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: null, count: null, error: null }).then(resolve, reject);
    };
    return builder;
  });
  return { from, updates };
}

describe("POST /api/import/review", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.triggerTranslationServer.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when REVIEW_INGEST_KEY is missing", async () => {
    vi.stubEnv("REVIEW_INGEST_KEY", "");
    const response = await POST(
      request({ action: "evaluate", slug: "sunset-hike" }, "Bearer x"),
    );
    expect(response.status).toBe(503);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token", async () => {
    vi.stubEnv("REVIEW_INGEST_KEY", "review-secret");
    const response = await POST(
      request({ action: "publish", slug: "sunset-hike" }, "Bearer other"),
    );
    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("evaluates a complete draft as passing", async () => {
    vi.stubEnv("REVIEW_INGEST_KEY", "review-secret");
    mocks.createClient.mockReturnValue(mockSupabase(draft));

    const response = await POST(
      request({ action: "evaluate", slug: "sunset-hike" }, "Bearer review-secret"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      action: "evaluate",
      passed: true,
      event: { slug: "sunset-hike", status: "draft" },
    });
    expect(mocks.triggerTranslationServer).not.toHaveBeenCalled();
  });

  it("publishes only when quality checks pass", async () => {
    vi.stubEnv("REVIEW_INGEST_KEY", "review-secret");
    const supabase = mockSupabase(draft);
    mocks.createClient.mockReturnValue(supabase);

    const response = await POST(
      request({ action: "publish", id: draft.id }, "Bearer review-secret"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      action: "publish",
      passed: true,
      published: true,
      event: { status: "published" },
    });
    expect(supabase.updates[0]).toMatchObject({
      table: "events",
      row: { status: "published" },
    });
    expect(mocks.triggerTranslationServer).toHaveBeenCalledOnce();
    expect(mocks.triggerTranslationServer).toHaveBeenCalledWith("event", draft.id, [
      { field_name: "title", text: draft.title },
      { field_name: "description", text: draft.description },
    ]);
  });

  it("keeps a failing draft unpublished and returns reasons", async () => {
    vi.stubEnv("REVIEW_INGEST_KEY", "review-secret");
    const supabase = mockSupabase({
      ...draft,
      location_name: "District 1",
      address: "HCMC",
      title: "Saigon party",
      description: "Rooftop only",
    });
    mocks.createClient.mockReturnValue(supabase);

    const response = await POST(
      request({ action: "publish", slug: "sunset-hike" }, "Bearer review-secret"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.published).toBe(false);
    expect(body.passed).toBe(false);
    expect(body.reasons.map((reason: { code: string }) => reason.code)).toContain(
      "not_dalat_locality",
    );
    expect(supabase.updates).toHaveLength(0);
    expect(mocks.triggerTranslationServer).not.toHaveBeenCalled();
  });

  it("reports translation and image gaps on qa without inventing content", async () => {
    vi.stubEnv("REVIEW_INGEST_KEY", "review-secret");
    mocks.createClient.mockReturnValue(mockSupabase(draft));

    const response = await POST(
      request({ action: "qa", slug: "sunset-hike" }, "Bearer review-secret"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.action).toBe("qa");
    expect(body.translations.passed).toBe(false);
    expect(body.translations.missingLocales.length).toBeGreaterThan(0);
    expect(body.images.passed).toBe(false);
    expect(body.images.gaps.some((gap: { code: string }) => gap.code === "missing_promo")).toBe(
      true,
    );
  });

  it("rejects a draft with structured reasons and leaves it unpublished", async () => {
    vi.stubEnv("REVIEW_INGEST_KEY", "review-secret");
    const supabase = mockSupabase(draft);
    mocks.createClient.mockReturnValue(supabase);

    const response = await POST(
      request(
        {
          action: "reject",
          slug: "sunset-hike",
          reasons: ["Wrong city night time", "Near-duplicate of an existing listing"],
        },
        "Bearer review-secret",
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      action: "reject",
      rejected: true,
      event: { status: "draft" },
      reasons: [
        { message: "Wrong city night time" },
        { message: "Near-duplicate of an existing listing" },
      ],
    });
    expect(supabase.updates[0]).toMatchObject({
      table: "events",
      row: {
        source_metadata: expect.objectContaining({
          review_result: "rejected",
          needs_review: false,
          reject_reasons: [
            "Wrong city night time",
            "Near-duplicate of an existing listing",
          ],
        }),
      },
    });
    expect(mocks.triggerTranslationServer).not.toHaveBeenCalled();
  });

  it("requires reasons when action is reject", async () => {
    vi.stubEnv("REVIEW_INGEST_KEY", "review-secret");
    const response = await POST(
      request({ action: "reject", slug: "sunset-hike" }, "Bearer review-secret"),
    );
    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
