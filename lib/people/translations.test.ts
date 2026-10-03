// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTENT_LOCALES } from "@/lib/types";
import { collectTranslationWork, peopleTranslationSourceStillMatches } from "@/lib/translation-sweep";

const ID = "71000000-0000-4000-8000-000000000001";
const REVISION = "2026-10-02T10:20:30.123456+00:00";
const person = {
  user_id: ID,
  enabled: true,
  help_offered: "I can help with websites.",
  help_wanted: "Vietnamese practice",
  source_locale: null,
  content_updated_at: REVISION,
  profiles: { is_private: false, is_ghost: false },
};

type Query = { table: string; calls: Array<{ method: string; args: unknown[] }> };
type TestClient = Parameters<typeof collectTranslationWork>[0];
function clientFor(people: unknown[] = [], coverage: unknown[] = [], peopleError: string | null = null) {
  const queries: Query[] = [];
  const from = vi.fn((table: string) => {
    const query: Query = { table, calls: [] };
    queries.push(query);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "order", "limit", "in", "range", "or"]) {
      chain[method] = (...args: unknown[]) => {
        query.calls.push({ method, args });
        return chain;
      };
    }
    const result = {
      data: table === "people_profiles" ? people : table === "content_translations" ? coverage : [],
      error: table === "people_profiles" && peopleError ? { message: peopleError } : null,
    };
    chain.then = (resolve: (value: typeof result) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  });
  return { client: { from } as unknown as TestClient, from, queries };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PEOPLE_ENABLED", "false");
  vi.stubEnv("PEOPLE_TRANSLATIONS_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("People translation work collection", () => {
  it("does not query undeployed People tables when both release gates are off", async () => {
    const { client, from } = clientFor([person]);
    await expect(collectTranslationWork(client, 20)).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalledWith("people_profiles");
  });

  it.each(["NEXT_PUBLIC_PEOPLE_ENABLED", "PEOPLE_TRANSLATIONS_ENABLED"])("queues all twelve locales behind %s and preserves the exact source revision", async (flag) => {
    vi.stubEnv(flag, "true");
    const { client } = clientFor([person]);
    const work = await collectTranslationWork(client, 20);
    expect(work).toEqual([{
      contentType: "people",
      contentId: ID,
      sourceLocale: null,
      sourceUpdatedAt: REVISION,
      fields: [
        { field_name: "help_offered", text: person.help_offered },
        { field_name: "help_wanted", text: person.help_wanted },
      ],
      missingLocales: CONTENT_LOCALES,
    }]);
    expect(work[0].sourceUpdatedAt).toContain(".123456");
  });

  it("requires eligibility filters even though the background worker uses a privileged client", async () => {
    vi.stubEnv("PEOPLE_TRANSLATIONS_ENABLED", "true");
    const { client, queries } = clientFor([person]);
    await collectTranslationWork(client, 20);
    const calls = queries.find((query) => query.table === "people_profiles")!.calls;
    expect(calls).toContainEqual({ method: "eq", args: ["enabled", true] });
    expect(calls).toContainEqual({ method: "eq", args: ["profiles.is_private", false] });
    const ghostFiltered = calls.some((call) =>
      (call.method === "eq" && call.args[0] === "profiles.is_ghost" && call.args[1] === false)
      || (call.method === "or" && typeof call.args[0] === "string"
        && call.args[0].split(",").sort().join(",") === "is_ghost.eq.false,is_ghost.is.null"
        && (call.args[1] as { referencedTable?: string })?.referencedTable === "profiles")
    );
    expect(ghostFiltered).toBe(true);
    expect(calls.find((call) => call.method === "select")?.args[0]).toContain("profiles!inner");
  });

  it("queues only nonempty help fields, never an empty profile", async () => {
    vi.stubEnv("PEOPLE_TRANSLATIONS_ENABLED", "true");
    const empty = clientFor([{ ...person, help_offered: "  ", help_wanted: "" }]);
    await expect(collectTranslationWork(empty.client, 20)).resolves.toEqual([]);
    const single = clientFor([{ ...person, help_offered: "" }]);
    const work = await collectTranslationWork(single.client, 20);
    expect(work[0].fields).toEqual([{ field_name: "help_wanted", text: person.help_wanted }]);
    expect(work[0].missingLocales).toEqual(CONTENT_LOCALES);
  });

  it("does not requeue complete coverage, but notices a missing field in one locale", async () => {
    vi.stubEnv("PEOPLE_TRANSLATIONS_ENABLED", "true");
    const coverage = CONTENT_LOCALES.flatMap((locale) => ["help_offered", "help_wanted"].map((field) => ({
      content_type: "people", content_id: ID, target_locale: locale, field_name: field,
      updated_at: "2026-10-02T10:21:00.000000+00:00", translation_status: "auto",
    })));
    const complete = clientFor([person], coverage);
    await expect(collectTranslationWork(complete.client, 20)).resolves.toEqual([]);
    const partial = clientFor([person], coverage.filter((row) => !(row.target_locale === "vi" && row.field_name === "help_wanted")));
    const work = await collectTranslationWork(partial.client, 20);
    expect(work[0].missingLocales).toEqual(["vi"]);
  });

  it("surfaces a failed protected-content query instead of silently skipping People", async () => {
    vi.stubEnv("PEOPLE_TRANSLATIONS_ENABLED", "true");
    const { client } = clientFor([], [], "permission denied");
    await expect(collectTranslationWork(client, 20)).rejects.toThrow("people query failed");
  });
});

describe("People translation source validation", () => {
  const item = {
    sourceUpdatedAt: REVISION,
    fields: [
      { field_name: "help_offered", text: person.help_offered },
      { field_name: "help_wanted", text: person.help_wanted },
    ],
  };

  it("accepts the exact enabled source while ignoring generic settings timestamps", () => {
    expect(peopleTranslationSourceStillMatches(item, {
      ...person, updated_at: "2026-10-02T12:30:00.000000+00:00",
    })).toBe(true);
  });

  it.each([undefined, null, ""])("fails closed when the work item has no source revision: %j", (sourceUpdatedAt) => {
    expect(peopleTranslationSourceStillMatches({ ...item, sourceUpdatedAt }, person)).toBe(false);
  });

  it.each([
    null,
    { ...person, enabled: false },
    { ...person, enabled: undefined },
    { ...person, help_offered: "New offer" },
    { ...person, help_wanted: "" },
    { ...person, content_updated_at: "2026-10-02T10:20:30.123457+00:00" },
    { ...person, content_updated_at: null },
  ])("rejects withdrawn, missing, or changed source: %j", (current) => {
    expect(peopleTranslationSourceStillMatches(item, current)).toBe(false);
  });
});
