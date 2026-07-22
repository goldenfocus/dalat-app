import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Authorization matrix for /api/users/search.
 *
 * The invite / "add who was there" modal is shown to every event creator, and
 * its username search hits this route — so event creators must pass the gate.
 * Regression: creators who were neither staff nor tribe leaders got a 403 the
 * client swallowed, leaving a permanently empty search dropdown.
 */

interface MockDb {
  user: { id: string } | null;
  role: string;
  leaderships: { id: string }[];
  ownedEvents: { id: string }[];
  searchResults: { id: string; username: string }[];
}

const db: MockDb = {
  user: { id: "u1" },
  role: "user",
  leaderships: [],
  ownedEvents: [],
  searchResults: [],
};

function makeBuilder(table: string) {
  let usedSingle = false;
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "or", "limit"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => {
    usedSingle = true;
    return builder;
  });
  builder.then = (
    resolve: (v: { data: unknown; error: null }) => void
  ) => {
    let data: unknown;
    if (table === "profiles") {
      data = usedSingle ? { role: db.role } : db.searchResults;
    } else if (table === "tribe_members") {
      data = db.leaderships;
    } else if (table === "events") {
      data = db.ownedEvents;
    }
    return Promise.resolve({ data, error: null }).then(resolve);
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: db.user } })) },
    from: vi.fn((table: string) => makeBuilder(table)),
  })),
}));

import { GET } from "./route";

function request(q: string) {
  return new NextRequest(`http://localhost/api/users/search?q=${encodeURIComponent(q)}`);
}

beforeEach(() => {
  db.user = { id: "u1" };
  db.role = "user";
  db.leaderships = [];
  db.ownedEvents = [];
  db.searchResults = [{ id: "u2", username: "yan" }];
});

describe("/api/users/search authorization", () => {
  it("401s when not signed in", async () => {
    db.user = null;
    const res = await GET(request("yan"));
    expect(res.status).toBe(401);
  });

  it("403s a plain user (no staff role, no tribe, no events)", async () => {
    const res = await GET(request("yan"));
    expect(res.status).toBe(403);
  });

  it("allows staff", async () => {
    db.role = "admin";
    const res = await GET(request("yan"));
    expect(res.status).toBe(200);
    expect((await res.json()).users).toHaveLength(1);
  });

  it("allows tribe leaders", async () => {
    db.leaderships = [{ id: "m1" }];
    const res = await GET(request("yan"));
    expect(res.status).toBe(200);
  });

  it("allows event creators — the 'add who was there' modal depends on it", async () => {
    db.ownedEvents = [{ id: "e1" }];
    const res = await GET(request("yan"));
    expect(res.status).toBe(200);
    expect((await res.json()).users).toHaveLength(1);
  });

  it("returns empty users for a sub-2-char query without touching auth", async () => {
    const res = await GET(request("y"));
    expect(res.status).toBe(200);
    expect((await res.json()).users).toEqual([]);
  });
});
