// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  cache: <T>(fn: T) => fn,
}));

import { getPeoplePage, getPeopleProfile } from "./server";
import type { PeopleIdentity, PeopleProfile } from "./types";

const ACTOR = "71000000-0000-4000-8000-000000000001";
const OTHER = "71000000-0000-4000-8000-000000000002";
const REVISION = "2026-10-02T10:20:30.123456+00:00";
const viewer = { id: ACTOR, is_private: false, is_ghost: false };
const person: PeopleProfile = {
  user_id: OTHER,
  enabled: true,
  intentions: ["friendship"],
  interests: ["coffee"],
  languages: ["en", "vi"],
  help_offered: "I can help with websites.",
  help_wanted: "Vietnamese practice",
  source_locale: null,
  created_at: REVISION,
  updated_at: REVISION,
  content_updated_at: REVISION,
};
const identity: PeopleIdentity = {
  id: OTHER,
  display_name: "Mai",
  username: "mai",
  avatar_url: null,
  bio: "I enjoy growing things.",
};

type Result = { data: unknown; error: null };
type Query = { table: string; calls: Array<{ method: string; args: unknown[] }> };

function database(rows: Record<string, unknown[]> = {}) {
  const queries: Query[] = [];
  const db = {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: vi.fn((table: string) => {
      const remaining = rows[table];
      if (!remaining?.length) throw new Error(`Unexpected database query: ${table}`);
      const result: Result = { data: remaining.shift(), error: null };
      const query: Query = { table, calls: [] };
      queries.push(query);
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "or", "maybeSingle"]) {
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

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_PEOPLE_ENABLED", "true");
  mocks.getUser.mockResolvedValue({ data: { user: { id: ACTOR } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("People server hydration privacy", () => {
  it("does not fetch a hidden person's identity or translations when RLS returns no People row", async () => {
    const { queries } = database({ profiles: [viewer], people_profiles: [null] });

    await expect(getPeopleProfile(OTHER, "vi")).resolves.toBeNull();

    expect(queries.map((query) => query.table)).toEqual(["profiles", "people_profiles"]);
    expect(queries[0].calls).toContainEqual({ method: "eq", args: ["id", ACTOR] });
    expect(queries[1].calls).toContainEqual({ method: "eq", args: ["user_id", OTHER] });
  });

  it("never resurrects a deleted bio from an old translation", async () => {
    database({
      profiles: [viewer, [{ ...identity, bio: "" }]],
      people_profiles: [person],
      content_translations: [[{
        content_id: OTHER, content_type: "profile", field_name: "bio",
        target_locale: "vi", translated_text: "Previously published private information",
        source_updated_at: null,
      }]],
    });

    const result = await getPeopleProfile(OTHER, "vi");

    expect(result?.profile.bio).toBe("");
  });

  it("uses help translations only for the exact source revision, including microseconds", async () => {
    database({
      profiles: [viewer, [identity]],
      people_profiles: [{ ...person, updated_at: "2026-10-02T12:30:00.000000+00:00" }],
      content_translations: [[
        {
          content_id: OTHER, content_type: "people", field_name: "help_offered",
          target_locale: "vi", translated_text: "Mình có thể giúp làm trang web.",
          source_updated_at: REVISION,
        },
        ...["vi", "en"].map((locale) => ({
          content_id: OTHER, content_type: "people", field_name: "help_wanted",
          target_locale: locale, translated_text: "An outdated request",
          source_updated_at: "2026-10-02T10:20:30.123455+00:00",
        })),
      ]],
    });

    const result = await getPeopleProfile(OTHER, "vi");

    expect(result?.help_offered).toBe("Mình có thể giúp làm trang web.");
    expect(result?.help_wanted).toBe(person.help_wanted);
    expect(result?.content_updated_at).toBe(REVISION);
  });

  it("does not fetch People data without a verified session", async () => {
    const { db } = database();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(getPeopleProfile(OTHER, "vi")).resolves.toBeNull();
    await expect(getPeoplePage({}, "vi")).resolves.toEqual({ people: [], hasMore: false });

    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not broaden an invalid event filter into unfiltered People discovery", async () => {
    const { queries } = database({ profiles: [viewer] });

    await expect(getPeoplePage({ eventId: "not-a-valid-event-id" }, "vi"))
      .resolves.toEqual({ people: [], hasMore: false });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(queries.map((query) => query.table)).toEqual(["profiles"]);
  });
});
