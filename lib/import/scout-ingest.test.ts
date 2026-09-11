import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return {
    ...actual,
    downloadAndUploadImage: vi.fn(async () => "https://cdn.dalat.app/event-media/x.jpg"),
    findOrCreateOrganizer: vi.fn(async () => null),
  };
});

import { ingestScoutEvent, resolveTimestamp } from "./scout-ingest";
import { scoutIngestSchema } from "./scout-schema";
import { downloadAndUploadImage } from "./utils";

const futureStart = "2026-09-20T19:00:00+07:00";
const now = new Date("2026-09-11T05:00:00.000Z");

const validPayload = {
  title: "Sunset hike Langbiang",
  description: "Canonical facts from source:\n19:00 20/09 at Langbiang, Đà Lạt.",
  starts_at: futureStart,
  location_name: "Langbiang, Đà Lạt",
  source_url: "https://ticketbox.vn/event/sunset-hike",
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
    const insert = supabase.inserts[0] as { row: { status: string; publish?: boolean } };
    expect(insert.row.status).toBe("draft");
    expect((insert.row as { source_locale: string | null }).source_locale).toBe("vi");
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
    expect(supabase.inserts).toHaveLength(0);
    expect(supabase.updates.length).toBeGreaterThan(0);
  });

  it("does not duplicate a published event with the same source_url", async () => {
    const supabase = createSupabaseMock({
      existing: {
        id: "evt-1",
        slug: "sunset-hike-langbiang",
        status: "published",
        source_platform: "scout",
        source_metadata: {},
        created_by: "00000000-0000-4000-8000-000000000001",
      },
    });
    const parsed = scoutIngestSchema.parse(validPayload);
    const result = await ingestScoutEvent(supabase as never, parsed, { now });

    expect(result).toMatchObject({
      ok: true,
      duplicate: true,
      status: "published",
      updated: false,
    });
    expect(supabase.inserts).toHaveLength(0);
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
});
