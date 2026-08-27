import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "moderator",
  adminRows: [] as Array<Record<string, unknown>>,
  queueRow: null as Record<string, unknown> | null,
  eventExists: true,
  update: null as Record<string, unknown> | null,
  createAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "moderator-1" } }, error: null })),
    },
    from: vi.fn(() => {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        single: vi.fn(async () => ({ data: { role: mocks.role }, error: null })),
      };
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      return builder;
    }),
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createAdmin,
}));

import { GET } from "./route";

function adminQueueClient() {
  return {
    from: vi.fn((table: string) => {
      const builder: Record<string, ReturnType<typeof vi.fn>> & {
        then?: (resolve: (value: unknown) => unknown) => Promise<unknown>;
      } = {
        select: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        maybeSingle: vi.fn(async () => ({
          data: table === "events"
            ? (mocks.eventExists ? { id: "22222222-2222-4222-8222-222222222222" } : null)
            : mocks.queueRow,
          error: null,
        })),
        update: vi.fn((value: Record<string, unknown>) => {
          mocks.update = value;
          return builder;
        }),
      };
      for (const method of ["select", "eq", "in", "order", "limit"] as const) {
        builder[method].mockReturnValue(builder);
      }
      builder.then = (resolve) => Promise.resolve({ data: mocks.adminRows, error: null }).then(resolve);
      return builder;
    }),
  };
}

describe("community flyer moderator API", () => {
  beforeEach(() => {
    mocks.role = "moderator";
    mocks.adminRows = [];
    mocks.queueRow = null;
    mocks.eventExists = true;
    mocks.update = null;
    mocks.createAdmin.mockReset().mockReturnValue(adminQueueClient());
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  });

  it("does not construct a service-role client before moderator verification", async () => {
    mocks.role = "user";
    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("returns sanitized pending and failed flyer fields only", async () => {
    mocks.adminRows = [{
      id: "queue-1",
      status: "pending",
      created_at: "2026-08-26T00:00:00.000Z",
      error_detail: null,
      payload: {
        title: "Flower Night",
        flyerUrl: "https://cdn.dalat.app/event-media/community-suggestions/u/x.png",
        submittedBy: "private-user-id",
      },
    }];
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.suggestions).toEqual([{
      id: "queue-1",
      status: "pending",
      title: "Flower Night",
      flyerUrl: "https://cdn.dalat.app/event-media/community-suggestions/u/x.png",
      createdAt: "2026-08-26T00:00:00.000Z",
      errorDetail: null,
    }]);
    expect(JSON.stringify(body)).not.toContain("private-user-id");
  });

  it("marks a review done only after verifying the created event", async () => {
    mocks.queueRow = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "pending",
      payload: { flyerUrl: "https://cdn.dalat.app/event-media/community-suggestions/u/x.png" },
    };
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("http://localhost/api/admin/import/community-flyers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "11111111-1111-4111-8111-111111111111",
        action: "complete",
        eventId: "22222222-2222-4222-8222-222222222222",
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.update).toMatchObject({
      status: "done",
      error_detail: null,
      payload: expect.objectContaining({
        reviewedBy: "moderator-1",
        createdEventId: "22222222-2222-4222-8222-222222222222",
      }),
    });
  });
});
