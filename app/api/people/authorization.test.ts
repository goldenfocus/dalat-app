// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { POST as saveProfile, PATCH as pauseProfile } from "./profile/route";
import { POST as joinEvent, DELETE as leaveEvent } from "./event/route";
import { PATCH as reviewReport } from "./review/route";
import { POST as reportPerson } from "./report/route";

const ACTOR = "71000000-0000-4000-8000-000000000001";
const OTHER = "71000000-0000-4000-8000-000000000002";
const EVENT = "72000000-0000-4000-8000-000000000001";
const REPORT = "73000000-0000-4000-8000-000000000001";
const validProfile = {
  enabled: true,
  intentions: ["friendship"],
  interests: ["coffee"],
  languages: ["en", "vi"],
  help_offered: "I can help with websites.",
  help_wanted: "Vietnamese practice",
  source_locale: null,
};

type Result = { data: unknown; error: { code?: string; message?: string } | null };
type Query = { table: string; calls: Array<{ method: string; args: unknown[] }> };

function database(results: Record<string, Result[]> = {}) {
  const queries: Query[] = [];
  const db = {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: vi.fn((table: string) => {
      const result = results[table]?.shift();
      if (!result) throw new Error(`Unexpected database query: ${table}`);
      const query: Query = { table, calls: [] };
      queries.push(query);
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "single", "maybeSingle", "insert", "upsert", "update", "delete"]) {
        chain[method] = (...args: unknown[]) => {
          query.calls.push({ method, args });
          return chain;
        };
      }
      chain.then = (resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject);
      return chain;
    }),
  };
  mocks.createClient.mockResolvedValue(db);
  return { db, queries };
}

function request(path: string, body: unknown, method = "POST", origin = "https://dalat.app") {
  return new Request(`https://dalat.app/api/people/${path}`, {
    method,
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_PEOPLE_ENABLED", "true");
  mocks.getUser.mockResolvedValue({ data: { user: { id: ACTOR } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("People request authorization", () => {
  it("keeps the disabled feature unavailable before creating an authenticated client", async () => {
    vi.stubEnv("NEXT_PUBLIC_PEOPLE_ENABLED", "false");
    const response = await saveProfile(request("profile", validProfile));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requires a verified session before reading or writing profiles", async () => {
    const { db } = database();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await saveProfile(request("profile", validProfile));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "unauthorized" });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects a foreign Origin before accessing the session", async () => {
    const response = await pauseProfile(request("profile", { enabled: false }, "PATCH", "https://unrelated.example"));
    expect(response.status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each(["user_id", "role", "content_updated_at"])("rejects profile mass assignment through %s", async (field) => {
    const { db } = database();
    const response = await saveProfile(request("profile", { ...validProfile, [field]: OTHER }));
    expect(response.status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("does not enable discovery for an existing private profile", async () => {
    const { queries } = database({ profiles: [{ data: { is_private: true, is_ghost: false }, error: null }] });
    const response = await saveProfile(request("profile", validProfile));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "private_profile" });
    expect(queries.map((query) => query.table)).toEqual(["profiles"]);
  });

  it("saves under the session identity and leaves authored language pending detection", async () => {
    const { queries } = database({
      profiles: [{ data: { is_private: false, is_ghost: false }, error: null }],
      people_profiles: [{ data: null, error: null }, { data: { user_id: ACTOR }, error: null }],
    });
    const response = await saveProfile(request("profile", { ...validProfile, source_locale: "en" }));
    expect(response.status).toBe(200);
    const write = queries.flatMap((query) => query.calls).find((call) => call.method === "upsert");
    expect(write?.args[0]).toEqual({ ...validProfile, user_id: ACTOR, source_locale: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("pauses only the session owner's profile without overwriting their saved text", async () => {
    const { queries } = database({ people_profiles: [{ data: { user_id: ACTOR, enabled: false }, error: null }] });
    const response = await pauseProfile(request("profile", { enabled: false }, "PATCH"));
    expect(response.status).toBe(200);
    expect(queries[0].calls).toContainEqual({ method: "update", args: [{ enabled: false }] });
    expect(queries[0].calls).toContainEqual({ method: "eq", args: ["user_id", ACTOR] });
  });

  it("does not accept another identity in a pause request", async () => {
    const { db } = database();
    const response = await pauseProfile(request("profile", { enabled: false, user_id: OTHER }, "PATCH"));
    expect(response.status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe("People event consent", () => {
  it("creates consent only for the actual signed-in person", async () => {
    const { queries } = database({ event_people: [{ data: null, error: null }] });
    expect((await joinEvent(request("event", { event_id: EVENT }))).status).toBe(200);
    expect(queries[0].calls).toContainEqual({ method: "insert", args: [{ user_id: ACTOR, event_id: EVENT }] });
  });

  it("rejects attempts to enroll another attendee", async () => {
    const { db } = database();
    expect((await joinEvent(request("event", { event_id: EVENT, user_id: OTHER }))).status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("does not report success when database attendance/privacy authorization denies consent", async () => {
    database({ event_people: [{ data: null, error: { code: "42501" } }] });
    expect((await joinEvent(request("event", { event_id: EVENT }))).status).toBe(403);
  });

  it("revokes consent using both the session owner and requested event", async () => {
    const { queries } = database({ event_people: [{ data: null, error: null }] });
    expect((await leaveEvent(request("event", { event_id: EVENT }, "DELETE"))).status).toBe(200);
    expect(queries[0].calls).toContainEqual({ method: "eq", args: ["user_id", ACTOR] });
    expect(queries[0].calls).toContainEqual({ method: "eq", args: ["event_id", EVENT] });
  });
});

describe("People report authority", () => {
  it("rejects assigning a safety report to a different reporter", async () => {
    const { db } = database();
    const response = await reportPerson(request("report", { user_id: OTHER, reason: "spam", reporter_id: OTHER }));
    expect(response.status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { data: false, error: null },
    { data: null, error: { code: "unavailable" } },
  ])("fails closed when staff authorization is absent or unavailable: %j", async (result) => {
    const { db } = database();
    mocks.rpc.mockResolvedValue(result);
    const response = await reviewReport(request("review", { id: REPORT, status: "reviewed" }, "PATCH"));
    expect(response.status).toBe(403);
    expect(mocks.rpc).toHaveBeenCalledWith("people_is_staff");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("allows an authorized reviewer to change only the report status", async () => {
    const { queries } = database({ people_reports: [{ data: { id: REPORT }, error: null }] });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const response = await reviewReport(request("review", { id: REPORT, status: "reviewed" }, "PATCH"));
    expect(response.status).toBe(200);
    expect(queries[0].calls).toContainEqual({ method: "update", args: [{ status: "reviewed" }] });
    expect(queries[0].calls).toContainEqual({ method: "eq", args: ["id", REPORT] });
  });
});
