import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  downloadAndUploadImage: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/import/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/import/utils")>(
    "@/lib/import/utils",
  );
  return { ...actual, downloadAndUploadImage: mocks.downloadAndUploadImage };
});

vi.mock("@/lib/import/safe-url", async () => {
  const actual = await vi.importActual<typeof import("@/lib/import/safe-url")>(
    "@/lib/import/safe-url",
  );
  return { ...actual, isSafePublicHttpUrl: vi.fn(async () => true) };
});

import { POST } from "./route";

const payload = {
  title: "Sunset hike Langbiang",
  description: "Canonical facts from source:\n19:00 20/09 at Langbiang, Đà Lạt.",
  starts_at: "2026-09-20T19:00:00+07:00",
  location_name: "Langbiang, Đà Lạt",
  source_url: "https://ticketbox.vn/event/sunset-hike",
  source_image_urls: [
    "https://ticketbox.vn/media/cover.jpg",
    "https://ticketbox.vn/media/crowd.jpg",
    "https://ticketbox.vn/media/trail.jpg",
  ],
  publish: true,
};

function request(body: unknown, header?: string) {
  return new Request("http://localhost/api/import/scout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(header ? { Authorization: header } : {}),
    },
    body: JSON.stringify(body),
  });
}

function mockSupabase() {
  const inserts: unknown[] = [];
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.insert = vi.fn((row: unknown) => {
      inserts.push({ table, row });
      return builder;
    });
    builder.update = vi.fn(chain);
    builder.delete = vi.fn(chain);
    builder.eq = vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    });
    builder.limit = vi.fn(chain);
    builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    builder.single = vi.fn(async () => {
      if (table === "events" && "slug" in filters && inserts.length === 0) {
        return { data: null, error: null };
      }
      return { data: { id: "evt-1", slug: "sunset-hike-langbiang" }, error: null };
    });
    builder.then = (
      resolve: (value: { data: null; error: null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
    return builder;
  });
  return { from, inserts };
}

describe("POST /api/import/scout", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.downloadAndUploadImage.mockReset();
    mocks.downloadAndUploadImage.mockResolvedValue(
      "https://cdn.dalat.app/event-media/x.jpg",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    vi.stubEnv("IMPORT_CREATED_BY", "00000000-0000-4000-8000-000000000001");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when SCOUT_INGEST_KEY is missing", async () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "");
    const response = await POST(request(payload, "Bearer anything"));
    expect(response.status).toBe(503);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects a missing bearer token before touching supabase", async () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "scout-secret");
    const response = await POST(request(payload));
    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects a cookie session in place of the bearer secret", async () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "scout-secret");
    const response = await POST(
      new Request("http://localhost/api/import/scout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "sb-access-token=scout-secret",
        },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 400 before a DB write when only one source image is sent", async () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "scout-secret");
    const response = await POST(
      request(
        {
          ...payload,
          source_image_urls: ["https://ticketbox.vn/media/cover.jpg"],
        },
        "Bearer scout-secret",
      ),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid payload",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 400 before a DB write when images and visual_gap_reason are missing", async () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "scout-secret");
    const { source_image_urls: _images, ...withoutVisuals } = payload;
    const response = await POST(request(withoutVisuals, "Bearer scout-secret"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid payload",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("inserts a draft via the service client and ignores publish", async () => {
    vi.stubEnv("SCOUT_INGEST_KEY", "scout-secret");
    const supabase = mockSupabase();
    mocks.createClient.mockReturnValue(supabase);

    const response = await POST(request(payload, "Bearer scout-secret"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "evt-1",
      slug: "sunset-hike-langbiang",
      status: "draft",
      created: true,
    });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    const insert = supabase.inserts[0] as { row: { status: string } };
    expect(insert.row.status).toBe("draft");
  });
});
