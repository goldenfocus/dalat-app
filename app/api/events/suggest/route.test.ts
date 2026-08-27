import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromCall: 0,
  inserted: null as Record<string, unknown> | null,
  upload: vi.fn(),
  remove: vi.fn(),
  r2Configured: true,
  upsertResult: [{ id: "queue-1" }] as Array<{ id: string }>,
  existing: null as { id: string; status: string } | null,
}));

function makeAdminBuilder(call: number) {
  const builder: Record<string, unknown> = {};
  let upserted = false;
  for (const method of ["select", "eq", "in", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({ data: mocks.existing, error: null }));
  builder.upsert = vi.fn((row: Record<string, unknown>) => {
    mocks.inserted = row;
    upserted = true;
    return builder;
  });
  builder.update = vi.fn((row: Record<string, unknown>) => {
    mocks.inserted = row;
    upserted = true;
    return builder;
  });
  builder.then = (resolve: (value: unknown) => unknown) => {
    const response = upserted
      ? { data: mocks.upsertResult, error: null }
      : call === 0
      ? { count: 0, error: null }
      : { data: [], error: null };
    return Promise.resolve(response).then(resolve);
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "person-1" } },
        error: null,
      })),
    },
    rpc: vi.fn(async () => ({ data: { allowed: true }, error: null })),
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => makeAdminBuilder(mocks.fromCall++)),
  })),
}));

vi.mock("@/lib/storage", () => ({
  isR2Configured: vi.fn(() => mocks.r2Configured),
  getStorageProvider: vi.fn(async () => ({
    upload: mocks.upload,
    delete: mocks.remove,
  })),
}));

import { POST } from "./route";

function flyerRequest(bytes: Uint8Array | string, name: string, type: string): Request {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const file = {
    name,
    type,
    size: data.byteLength,
    arrayBuffer: async () => data.slice().buffer,
  } as File;
  return {
    headers: new Headers({ "Content-Type": "multipart/form-data; boundary=test" }),
    formData: async () => ({ get: () => file }),
  } as unknown as Request;
}

const VALID_PNG = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
));

describe("POST /api/events/suggest flyer submissions", () => {
  beforeEach(() => {
    mocks.fromCall = 0;
    mocks.inserted = null;
    mocks.r2Configured = true;
    mocks.upsertResult = [{ id: "queue-1" }];
    mocks.existing = null;
    mocks.upload.mockReset().mockResolvedValue("https://cdn.dalat.app/flyer.png");
    mocks.remove.mockReset().mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  });

  it("rejects multipart files whose bytes do not match the declared image type", async () => {
    const response = await POST(flyerRequest("not an image", "event.png", "image/png"));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "invalid_flyer" });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.inserted).toBeNull();
  });

  it("uploads a validated flyer to R2 and enqueues it for manual review", async () => {
    const response = await POST(flyerRequest(VALID_PNG, "flower night.png", "image/png"));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      code: "queued_for_review",
      duplicate: false,
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      "event-media",
      expect.stringMatching(/^community-suggestions\/[a-f0-9]{64}\.png$/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/png" })
    );
    expect(mocks.inserted).toMatchObject({
      source: "community-suggestion",
      type: "image",
      source_uid: expect.stringMatching(/^flyer:[a-f0-9]{64}$/),
      payload: expect.objectContaining({
        flyerUrl: "https://cdn.dalat.app/flyer.png",
        submittedBy: "person-1",
        reviewMode: "manual",
      }),
    });
    expect(mocks.inserted).not.toHaveProperty("status", "published");
  });

  it("treats a concurrent identical insert as a duplicate without deleting the shared flyer", async () => {
    mocks.upsertResult = [];
    const response = await POST(flyerRequest(VALID_PNG, "flower night.png", "image/png"));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ duplicate: true });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("requeues a terminal flyer row instead of permanently rejecting resubmission", async () => {
    mocks.existing = { id: "old-row", status: "failed" };

    const response = await POST(flyerRequest(VALID_PNG, "flower night.png", "image/png"));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ duplicate: false });
    expect(mocks.inserted).toMatchObject({ status: "pending", attempts: 0, error_detail: null });
  });

  it("does not upload again while an identical flyer is already under review", async () => {
    mocks.existing = { id: "pending-row", status: "pending" };

    const response = await POST(flyerRequest(VALID_PNG, "flower night.png", "image/png"));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ duplicate: true });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("fails closed when R2 is unavailable", async () => {
    mocks.r2Configured = false;
    const response = await POST(
      flyerRequest(VALID_PNG, "event.png", "image/png")
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "storage_unavailable" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
