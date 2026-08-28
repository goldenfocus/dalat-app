import { describe, expect, it, vi } from "vitest";
import {
  collectTranslationWork,
  getVenueTranslatableFields,
} from "./translation-sweep";

type QueryResult = {
  data: unknown[];
  error: { message: string } | null;
};

function makeBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "order", "limit", "in", "range"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

type TestClient = Parameters<typeof collectTranslationWork>[0];

function makeClient(venues: unknown[]) {
  return {
    from: vi.fn((table: string) =>
      makeBuilder({ data: table === "venues" ? venues : [], error: null })
    ),
  } as unknown as TestClient;
}

describe("venue translation fields", () => {
  it("translates the description without ever queuing the proper name", () => {
    expect(getVenueTranslatableFields("A community arts venue.")).toEqual([
      { field_name: "description", text: "A community arts venue." },
    ]);
  });

  it("does not queue empty venue copy", () => {
    expect(getVenueTranslatableFields("   ")).toEqual([]);
    expect(getVenueTranslatableFields(null)).toEqual([]);
  });

  it("collects venue descriptions without ever adding the name as a title", async () => {
    const client = makeClient([
      {
        id: "venue-1",
        name: "PHỐ BÊN ĐỒI",
        description: "Không gian nghệ thuật cộng đồng.",
        source_locale: "vi",
      },
    ]);

    const work = await collectTranslationWork(client, 20);

    expect(work).toContainEqual(
      expect.objectContaining({
        contentType: "venue",
        contentId: "venue-1",
        sourceLocale: "vi",
        fields: [
          {
            field_name: "description",
            text: "Không gian nghệ thuật cộng đồng.",
          },
        ],
      })
    );
    expect(work.find((item) => item.contentId === "venue-1")?.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ field_name: "title" })])
    );
  });

  it("does not create translation work for a name-only venue", async () => {
    const client = makeClient([
      {
        id: "venue-2",
        name: "PHỐ BÊN ĐỒI",
        description: null,
        source_locale: "vi",
      },
    ]);

    await expect(collectTranslationWork(client, 20)).resolves.toEqual([]);
  });
});
