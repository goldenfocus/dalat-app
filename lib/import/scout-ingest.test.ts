import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return {
    ...actual,
    downloadAndUploadImage: vi.fn(async () => "https://cdn.dalat.app/event-media/x.jpg"),
    findOrCreateOrganizer: vi.fn(async () => null),
  };
});

vi.mock("./safe-url", async () => {
  const actual = await vi.importActual<typeof import("./safe-url")>("./safe-url");
  return {
    ...actual,
    isSafePublicHttpUrl: vi.fn(async () => true),
  };
});

import { ingestScoutEvent, resolveTimestamp } from "./scout-ingest";
import { scoutIngestSchema } from "./scout-schema";
import { downloadAndUploadImage } from "./utils";

const futureStart = "2026-09-20T19:00:00+07:00";
const now = new Date("2026-09-11T05:00:00.000Z");

const factsOnlyPayload = {
  title: "Sunset hike Langbiang",
  description: "Canonical facts from source:\n19:00 20/09 at Langbiang, Đà Lạt.",
  starts_at: futureStart,
  location_name: "Langbiang, Đà Lạt",
  source_url: "https://ticketbox.vn/event/sunset-hike",
};

const sourceImages = [
  "https://ticketbox.vn/media/cover.jpg",
  "https://ticketbox.vn/media/crowd.jpg",
  "https://ticketbox.vn/media/trail.jpg",
];

const validPayload = {
  ...factsOnlyPayload,
  source_image_urls: sourceImages,
};

function createSupabaseMock(options: {
  existing?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.insert = vi.fn((row: unknown) => {
      inserts.push({ table, row });
      return builder;
    });
    builder.update = vi.fn((row: unknown) => {
      updates.push({ table, row });
      return builder;
    });
    builder.delete = vi.fn(chain);
    builder.eq = vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    });
    builder.limit = vi.fn(chain);
    builder.maybeSingle = vi.fn(async () => {
      if (table === "events" && "external_chat_url" in filters) {
        return { data: options.existing ?? null, error: null };
      }
      return { data: null, error: null };
    });
    builder.single = vi.fn(async () => {
      if (table === "events" && "slug" in filters && inserts.length === 0) {
        return { data: null, error: null };
      }
      if (options.insertError) {
        return { data: null, error: options.insertError };
      }
      return { data: { id: "evt-1", slug: "sunset-hike-langbiang" }, error: null };
    });
    builder.then = (
      resolve: (value: { data: null; error: null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
    return builder;
  });
  return { from, inserts, updates };
}

describe("scoutIngestSchema", () => {
  it("accepts a Canonical facts from source description", () => {
    const parsed = scoutIngestSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it("rejects Activity Graph as a source_platform", () => {
    const parsed = scoutIngestSchema.safeParse({
      ...validPayload,
      source_platform: "activity-graph",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a start or a date", () => {
    const { starts_at: _starts, ...rest } = validPayload;
    expect(scoutIngestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects when images and visual_gap_reason are all missing", () => {
    const parsed = scoutIngestSchema.safeParse(factsOnlyPayload);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) =>
      issue.message.includes("visual_gap_reason"),
    )).toBe(true);
  });

  it("rejects empty image arrays without visual_gap_reason", () => {
    expect(
      scoutIngestSchema.safeParse({
        ...factsOnlyPayload,
        source_image_urls: [],
        promo_image_urls: [],
      }).success,
    ).toBe(false);
  });

  it("accepts visual_gap_reason without images", () => {
    const parsed = scoutIngestSchema.safeParse({
      ...factsOnlyPayload,
      visual_gap_reason: "Organizer page has no reusable image",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a single source image without visual_gap_reason", () => {
    const parsed = scoutIngestSchema.safeParse({
      ...factsOnlyPayload,
      source_image_urls: ["https://ticketbox.vn/media/cover.jpg"],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) =>
      issue.message.includes("3 distinct"),
    )).toBe(true);
  });

  it("rejects two distinct images without visual_gap_reason", () => {
    expect(
      scoutIngestSchema.safeParse({
        ...factsOnlyPayload,
        source_image_urls: [
          "https://ticketbox.vn/media/cover.jpg",
          "https://ticketbox.vn/media/crowd.jpg",
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate URLs that only look like three images", () => {
    const url = "https://ticketbox.vn/media/cover.jpg";
    expect(
      scoutIngestSchema.safeParse({
        ...factsOnlyPayload,
        source_image_urls: [url, url],
        promo_image_urls: [url],
      }).success,
    ).toBe(false);
  });

  it("accepts one source image when visual_gap_reason documents the promo shortfall", () => {
    expect(
      scoutIngestSchema.safeParse({
        ...factsOnlyPayload,
        source_image_urls: ["https://ticketbox.vn/media/cover.jpg"],
        visual_gap_reason: "Organizer posted only one reusable image",
      }).success,
    ).toBe(true);
  });

  it("accepts source_image_urls", () => {
    expect(scoutIngestSchema.safeParse(validPayload).success).toBe(true);
  });

  it("accepts promo_image_urls without source images", () => {
    expect(
      scoutIngestSchema.safeParse({
        ...factsOnlyPayload,
        promo_image_urls: [
          "https://ticketbox.vn/media/promo-1.jpg",
          "https://ticketbox.vn/media/promo-2.jpg",
          "https://ticketbox.vn/media/promo-3.jpg",
        ],
      }).success,
    ).toBe(true);
  });
});

describe("resolveTimestamp", () => {
  it("interprets date+time as Asia/Ho_Chi_Minh", () => {
    const resolved = resolveTimestamp(undefined, "2026-09-20", "19:00");
    expect(resolved?.toISOString()).toBe("2026-09-20T12:00:00.000Z");
  });

  it("keeps an offset ISO timestamp", () => {
    expect(resolveTimestamp("2026-09-20T19:00:00+07:00")?.toISOString()).toBe(
      "2026-09-20T12:00:00.000Z",
    );
  });
});

describe("ingestScoutEvent", () => {
  beforeEach(() => {
    vi.stubEnv("IMPORT_CREATED_BY", "00000000-0000-4000-8000-000000000001");
    vi.mocked(downloadAndUploadImage).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("inserts a draft and ignores a publish flag", async () => {
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse({ ...validPayload, publish: true });
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("draft");
    expect(result.created).toBe(true);
    const insert = supabase.inserts[0] as {
      row: { status: string; source_locale: string | null; publish?: boolean };
    };
    expect(insert.row.status).toBe("draft");
    expect(insert.row.source_locale).toBeNull();
  });

  it("leaves source_locale null when the script is ambiguous Latin", async () => {
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse({
      ...validPayload,
      title: "Sunset hike Langbiang",
      description: "Canonical facts from source: 19:00 20/09 at Langbiang, Da Lat.",
    });
    const result = await ingestScoutEvent(supabase as never, parsed, { now });
    expect(result.ok).toBe(true);
    const insert = supabase.inserts[0] as { row: { source_locale: string | null } };
    expect(insert.row.source_locale).toBeNull();
  });

  it("stores a script-inferred source_locale on Vietnamese scout copy", async () => {
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse({
      ...validPayload,
      title: "Hà Nhi live in Dalat tại La Maritza",
      description: "Đêm nhạc tại Đà Lạt.",
    });
    const result = await ingestScoutEvent(supabase as never, parsed, { now });
    expect(result.ok).toBe(true);
    const insert = supabase.inserts[0] as { row: { source_locale: string | null; status: string } };
    expect(insert.row.status).toBe("draft");
    expect(insert.row.source_locale).toBe("vi");
  });

  it("stores an explicit source_locale even when the script hint is null", async () => {
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse({
      ...validPayload,
      source_locale: "vi",
    });
    const result = await ingestScoutEvent(supabase as never, parsed, { now });
    expect(result.ok).toBe(true);
    const insert = supabase.inserts[0] as { row: { source_locale: string | null } };
    expect(insert.row.source_locale).toBe("vi");
  });

  it("is idempotent on source_url for an existing draft", async () => {
    const supabase = createSupabaseMock({
      existing: {
        id: "evt-1",
        slug: "sunset-hike-langbiang",
        status: "draft",
        source_platform: "scout",
        source_metadata: {},
        created_by: "00000000-0000-4000-8000-000000000001",
      },
    });
    const parsed = scoutIngestSchema.parse(validPayload);
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updated).toBe(true);
    expect(result.created).toBe(false);
    expect(supabase.inserts.filter((entry) => (entry as { table: string }).table === "events")).toHaveLength(0);
    expect(supabase.updates.length).toBeGreaterThan(0);
  });

  it("does not create a second row for a published event with the same source_url", async () => {
    const supabase = createSupabaseMock({
      existing: {
        id: "evt-1",
        slug: "sunset-hike-langbiang",
        status: "published",
        source_platform: "scout",
        source_metadata: { review_result: "published", promo_count: 0 },
        created_by: "00000000-0000-4000-8000-000000000001",
        image_url: "https://cdn.dalat.app/event-media/old-hero.jpg",
        image_alt: "Old hero",
      },
    });
    const parsed = scoutIngestSchema.parse(validPayload);
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result).toMatchObject({
      ok: true,
      duplicate: false,
      status: "published",
      created: false,
      updated: true,
    });
    expect(supabase.inserts.filter((entry) => (entry as { table: string }).table === "events")).toHaveLength(0);
  });

  it("refreshes promo_media on a published event without changing status", async () => {
    const supabase = createSupabaseMock({
      existing: {
        id: "22271ffc-d7ad-4afe-b582-72abbaf31a79",
        slug: "phuong-linh-da-lat",
        status: "published",
        source_platform: "scout",
        source_metadata: {
          review_result: "published",
          needs_review: false,
          promo_count: 0,
          translation_needed_at: "2026-09-15T00:00:00.000Z",
        },
        created_by: "00000000-0000-4000-8000-000000000001",
        image_url: "https://cdn.dalat.app/event-media/old-hero.jpg",
        image_alt: "Old hero",
      },
    });
    const parsed = scoutIngestSchema.parse({
      ...validPayload,
      source_url: "https://ticketbox.vn/event/phuong-linh",
      source_image_urls: [
        "https://ticketbox.vn/media/hero.jpg",
        "https://ticketbox.vn/media/promo-1.jpg",
        "https://ticketbox.vn/media/promo-2.jpg",
      ],
    });
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result).toMatchObject({
      ok: true,
      id: "evt-1",
      status: "published",
      created: false,
      updated: true,
      duplicate: false,
    });
    const eventUpdate = supabase.updates.find(
      (entry) =>
        (entry as { table?: string; row?: { image_url?: string } }).row?.image_url,
    ) as {
      table?: string;
      row: {
        status?: string;
        image_url: string;
        image_alt: string | null;
        source_metadata: {
          promo_count: number;
          review_result: string;
          needs_review: boolean;
          translation_needed_at: string;
          visual_provenance: string;
        };
      };
    };
    expect(eventUpdate.row.status).toBeUndefined();
    expect(eventUpdate.row.image_url).toBe("https://cdn.dalat.app/event-media/x.jpg");
    expect(eventUpdate.row.source_metadata.promo_count).toBe(2);
    expect(eventUpdate.row.source_metadata.review_result).toBe("published");
    expect(eventUpdate.row.source_metadata.needs_review).toBe(false);
    expect(eventUpdate.row.source_metadata.translation_needed_at).toBe(
      "2026-09-15T00:00:00.000Z",
    );
    expect(eventUpdate.row.source_metadata.visual_provenance).toBe("owner_authorized_source");
    const promoInsert = supabase.inserts.find(
      (entry) => (entry as { table: string }).table === "promo_media",
    ) as { row: Array<{ media_url: string }> };
    expect(promoInsert.row).toHaveLength(2);
    expect(supabase.inserts.filter((entry) => (entry as { table: string }).table === "events")).toHaveLength(0);
  });

  it("does not rewrite a cancelled event with the same source_url", async () => {
    const supabase = createSupabaseMock({
      existing: {
        id: "evt-1",
        slug: "sunset-hike-langbiang",
        status: "cancelled",
        source_platform: "scout",
        source_metadata: {},
        created_by: "00000000-0000-4000-8000-000000000001",
        image_url: "https://cdn.dalat.app/event-media/old-hero.jpg",
        image_alt: "Old hero",
      },
    });
    const parsed = scoutIngestSchema.parse(validPayload);
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result).toMatchObject({
      ok: true,
      duplicate: true,
      status: "cancelled",
      updated: false,
    });
    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.updates).toHaveLength(0);
    expect(downloadAndUploadImage).not.toHaveBeenCalled();
  });

  it("skips events beyond the 45-day horizon", async () => {
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse({
      ...validPayload,
      starts_at: "2026-12-01T19:00:00+07:00",
    });
    const result = await ingestScoutEvent(supabase as never, parsed, { now });
    expect(result).toMatchObject({ ok: false, status: 422, code: "beyond_horizon" });
    expect(supabase.inserts).toHaveLength(0);
  });

  it("writes visual_gap metadata when only visual_gap_reason is provided", async () => {
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse({
      ...factsOnlyPayload,
      visual_gap_reason: "Organizer page has no reusable image",
    });
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    const insert = supabase.inserts[0] as {
      row: {
        image_url: string | null;
        source_metadata: {
          needs_review: boolean;
          visual_gap: { reason: string; documented_at: string } | null;
          hero_present: boolean;
        };
      };
    };
    expect(insert.row.image_url).toBeNull();
    expect(insert.row.source_metadata.needs_review).toBe(true);
    expect(insert.row.source_metadata.hero_present).toBe(false);
    expect(insert.row.source_metadata.visual_gap).toEqual({
      reason: "Organizer page has no reusable image",
      documented_at: expect.any(String),
      covers: ["hero", "promo"],
    });
    expect(downloadAndUploadImage).not.toHaveBeenCalled();
  });

  it("documents a promo visual gap when only one source image exists", async () => {
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse({
      ...factsOnlyPayload,
      source_image_urls: ["https://ticketbox.vn/media/cover.jpg"],
      visual_gap_reason: "Organizer posted only one reusable image",
    });
    const result = await ingestScoutEvent(supabase as never, parsed, { now });
    expect(result.ok).toBe(true);
    const insert = supabase.inserts[0] as {
      row: {
        image_url: string | null;
        source_metadata: {
          visual_gap: { reason: string; covers: string[] } | null;
          promo_count: number;
        };
      };
    };
    expect(insert.row.image_url).toBe("https://cdn.dalat.app/event-media/x.jpg");
    expect(insert.row.source_metadata.promo_count).toBe(0);
    expect(insert.row.source_metadata.visual_gap).toEqual({
      reason: "Organizer posted only one reusable image",
      documented_at: expect.any(String),
      covers: ["promo"],
    });
    expect(supabase.inserts.some((entry) => (entry as { table: string }).table === "promo_media")).toBe(
      false,
    );
  });

  it("accepts source_image_urls and stores a hero", async () => {
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse(validPayload);
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const insert = supabase.inserts[0] as {
      row: {
        image_url: string | null;
        source_metadata: { visual_gap: unknown; hero_present: boolean };
      };
    };
    expect(insert.row.image_url).toBe("https://cdn.dalat.app/event-media/x.jpg");
    expect(insert.row.source_metadata.hero_present).toBe(true);
    expect(insert.row.source_metadata.visual_gap).toBeNull();
    expect(downloadAndUploadImage).toHaveBeenCalledTimes(3);
    const promoInsert = supabase.inserts.find(
      (entry) => (entry as { table: string }).table === "promo_media",
    ) as { row: Array<{ media_url: string }> };
    expect(promoInsert.row).toHaveLength(2);
  });

  it("does not write a draft when image download fails and visual_gap_reason is absent", async () => {
    vi.mocked(downloadAndUploadImage).mockResolvedValueOnce(null);
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse(validPayload);
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: "missing_visual",
    });
    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.updates).toHaveLength(0);
  });

  it("does not write a draft when later promo downloads fail and no visual_gap_reason", async () => {
    vi.mocked(downloadAndUploadImage)
      .mockResolvedValueOnce("https://cdn.dalat.app/event-media/hero.jpg")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const supabase = createSupabaseMock({ existing: null });
    const parsed = scoutIngestSchema.parse(validPayload);
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: "missing_promo",
    });
    expect(supabase.inserts).toHaveLength(0);
  });
});
