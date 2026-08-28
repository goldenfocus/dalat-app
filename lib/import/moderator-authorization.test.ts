import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authError: null as { message: string } | null,
  authThrows: false,
  role: null as string | null,
  profileError: null as { message: string } | null,
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.single = vi.fn(async () => ({
      data: mocks.role ? { role: mocks.role } : null,
      error: mocks.profileError,
    }));
    mocks.from.mockImplementation(() => builder);

    return {
      auth: {
        getUser: vi.fn(async () => {
          if (mocks.authThrows) throw new Error("auth unavailable");
          return {
            data: { user: mocks.user },
            error: mocks.authError,
          };
        }),
      },
      from: mocks.from,
    };
  }),
}));

import { authorizeImportModerator } from "./moderator-authorization";

describe("authorizeImportModerator", () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.authError = null;
    mocks.authThrows = false;
    mocks.role = null;
    mocks.profileError = null;
    mocks.from.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 before querying a profile when there is no session", async () => {
    const result = await authorizeImportModerator();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["user", "contributor", "organizer_verified"])(
    "rejects the %s role",
    async (role) => {
      mocks.user = { id: "user-1" };
      mocks.role = role;

      const result = await authorizeImportModerator();

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    },
  );

  it.each(["moderator", "admin", "superadmin"])(
    "allows the %s role",
    async (role) => {
      mocks.user = { id: "staff-1" };
      mocks.role = role;

      const result = await authorizeImportModerator();

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.user.id).toBe("staff-1");
    },
  );

  it("fails closed when the role lookup fails", async () => {
    mocks.user = { id: "staff-1" };
    mocks.profileError = { message: "database unavailable" };

    const result = await authorizeImportModerator();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("fails closed when session verification throws", async () => {
    mocks.authThrows = true;

    const result = await authorizeImportModerator();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});
