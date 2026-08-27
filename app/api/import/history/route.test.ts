import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authError: null as { message: string } | null,
  role: null as string | null,
  profileError: null as { message: string } | null,
  serviceClientCreated: false,
}));

function profileBuilder() {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(async () => ({
    data: mocks.role ? { role: mocks.role } : null,
    error: mocks.profileError,
  }));
  return builder;
}

function eventBuilder() {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "not", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({
      data: [{ id: "draft-1", title: "Community draft" }],
      error: null,
    }).then(resolve);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mocks.user },
        error: mocks.authError,
      })),
    },
    from: vi.fn(() => profileBuilder()),
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    mocks.serviceClientCreated = true;
    return { from: vi.fn(() => eventBuilder()) };
  }),
}));

import { GET } from "./route";

describe("GET /api/import/history", () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.authError = null;
    mocks.role = null;
    mocks.profileError = null;
    mocks.serviceClientCreated = false;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  });

  it("does not expose draft import history to unauthenticated callers", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.serviceClientCreated).toBe(false);
  });

  it("rejects authenticated users below the moderator role", async () => {
    mocks.user = { id: "user-1" };
    mocks.role = "user";

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.serviceClientCreated).toBe(false);
  });

  it.each(["moderator", "admin", "superadmin"])(
    "allows %s reviewers to read import history",
    async (role) => {
      mocks.user = { id: "staff-1" };
      mocks.role = role;

      const response = await GET();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        events: [{ id: "draft-1", title: "Community draft" }],
      });
      expect(mocks.serviceClientCreated).toBe(true);
    }
  );
});
