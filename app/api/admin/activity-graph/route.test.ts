import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

type WriteRecord = {
  table: string;
  values: Record<string, unknown>;
  filters: Array<{ column: string; operator: "eq" | "gte"; value: unknown }>;
};

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createAdmin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  pingIndexNow: vi.fn(),
  writes: [] as WriteRecord[],
}));

vi.mock("@/lib/import/moderator-authorization", () => ({
  authorizeImportModerator: mocks.authorize,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createAdmin,
}));

vi.mock("@/lib/seo/indexnow", () => ({
  pingIndexNow: mocks.pingIndexNow,
}));

vi.mock("@/lib/i18n/routing", () => ({
  locales: ["en", "vi"],
}));

import { GET, PATCH } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/activity-graph", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function denied(status: 401 | 403) {
  return {
    ok: false as const,
    response: NextResponse.json(
      {
        error:
          status === 401
            ? "Authentication required"
            : "Insufficient permissions",
      },
      { status },
    ),
  };
}

function adminClient() {
  mocks.from.mockImplementation((table: string) => {
    let write: WriteRecord | null = null;
    const builder: Record<string, ReturnType<typeof vi.fn>> & {
      then?: (resolve: (value: unknown) => unknown) => Promise<unknown>;
    } = {};

    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((column: string, value: unknown) => {
      write?.filters.push({ column, operator: "eq", value });
      return builder;
    });
    builder.gte = vi.fn((column: string, value: unknown) => {
      write?.filters.push({ column, operator: "gte", value });
      return builder;
    });
    builder.update = vi.fn((values: Record<string, unknown>) => {
      write = { table, values, filters: [] };
      mocks.writes.push(write);
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => {
      if (table === "activity_candidates" && !write) {
        return {
          data: { id: CANDIDATE_ID, source_id: SOURCE_ID, status: "published" },
          error: null,
        };
      }
      if (table === "activity_canonical_links") {
        return {
          data: { event_id: EVENT_ID, event_series_id: null },
          error: null,
        };
      }
      if (table === "events") {
        return { data: { slug: "sunset-acoustic" }, error: null };
      }
      if (table === "activity_sources" && write) {
        return {
          data: { id: SOURCE_ID, status: write.values.status },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    builder.then = (resolve) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    return builder;
  });

  return { from: mocks.from, rpc: mocks.rpc };
}

describe("Activity Graph admin API", () => {
  beforeEach(() => {
    mocks.authorize.mockReset().mockResolvedValue({
      ok: true,
      user: { id: "moderator-1" },
      supabase: {},
    });
    mocks.createAdmin.mockReset().mockReturnValue(adminClient());
    mocks.from.mockClear();
    mocks.rpc.mockReset().mockResolvedValue({
      data: {
        projection_hidden: true,
        target_owned_by_activity_graph: true,
      },
      error: null,
    });
    mocks.pingIndexNow.mockReset().mockResolvedValue(undefined);
    mocks.writes.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  });

  it("blocks unauthenticated reads before constructing a service client", async () => {
    mocks.authorize.mockResolvedValue(denied(401));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("blocks an insufficient role before constructing a service client", async () => {
    mocks.authorize.mockResolvedValue(denied(403));

    const response = await PATCH(
      request({
        action: "unlist",
        candidateId: CANDIDATE_ID,
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["pause_source", "resume_source"])(
    "role-gates the %s action",
    async (action) => {
      mocks.authorize.mockResolvedValue(denied(403));

      const response = await PATCH(request({ action, sourceId: SOURCE_ID }));

      expect(response.status).toBe(403);
      expect(mocks.createAdmin).not.toHaveBeenCalled();
      expect(mocks.writes).toEqual([]);
    },
  );

  it("atomically unlists the candidate and its owned projection", async () => {
    const response = await PATCH(
      request({
        action: "unlist",
        candidateId: CANDIDATE_ID,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      status: "unlisted",
      projectionHidden: true,
      targetOwnedByActivityGraph: true,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("admin_unlist_activity_candidate", {
      p_candidate_id: CANDIDATE_ID,
      p_admin_id: "moderator-1",
      p_unlisted_at: expect.any(String),
    });
    expect(mocks.writes).toEqual([]);
    expect(mocks.pingIndexNow).toHaveBeenCalledWith([
      "/events/sunset-acoustic",
      "/vi/events/sunset-acoustic",
    ]);
  });

  it.each([
    ["pause_source", "paused"],
    ["resume_source", "active"],
  ])(
    "updates a source only after authorization for %s",
    async (action, status) => {
      const response = await PATCH(request({ action, sourceId: SOURCE_ID }));

      expect(response.status).toBe(200);
      expect(mocks.writes).toHaveLength(1);
      expect(mocks.writes[0]).toMatchObject({
        table: "activity_sources",
        values: { status },
        filters: [{ column: "id", operator: "eq", value: SOURCE_ID }],
      });
      if (action === "resume_source") {
        expect(mocks.writes[0].values.next_check_at).toEqual(
          expect.any(String),
        );
      }
    },
  );

  it("makes the parent source due without removing a public target from stale expiry", async () => {
    const response = await PATCH(
      request({
        action: "recheck",
        candidateId: CANDIDATE_ID,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.writes).toHaveLength(2);
    expect(mocks.writes[0]).toMatchObject({
      table: "activity_candidates",
      values: {
        next_check_at: expect.any(String),
      },
      filters: [{ column: "id", operator: "eq", value: CANDIDATE_ID }],
    });
    expect(mocks.writes[0].values).not.toHaveProperty("status");
    expect(mocks.writes[0].values).not.toHaveProperty("decision");
    expect(mocks.writes[1]).toMatchObject({
      table: "activity_sources",
      values: { next_check_at: expect.any(String) },
      filters: [{ column: "id", operator: "eq", value: SOURCE_ID }],
    });
  });

  it.each(["approve", "publish"])(
    "does not expose a %s action",
    async (action) => {
      const response = await PATCH(
        request({ action, candidateId: CANDIDATE_ID }),
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: "Invalid action" });
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.writes).toEqual([]);
      expect(mocks.pingIndexNow).not.toHaveBeenCalled();
    },
  );
});
