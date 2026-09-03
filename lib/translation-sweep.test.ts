import { describe, expect, it, vi } from "vitest";
import { CONTENT_LOCALES } from "@/lib/types";
import {
  blogTranslationSourceStillMatches,
  collectTranslationWork,
  getMissingTranslationLocales,
  getVenueTranslatableFields,
  translationCoverageIsCurrent,
  translationSourceStillMatches,
} from "./translation-sweep";

type QueryResult = {
  data: unknown[];
  error: { message: string } | null;
};

function makeBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "order", "limit", "in", "range", "or"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

type TestClient = Parameters<typeof collectTranslationWork>[0];

function makeClient(venues: unknown[]) {
  return {
    from: vi.fn((table: string) =>
      makeBuilder({ data: table === "venues" ? venues : [], error: null }),
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
      }),
    );
    expect(work.find((item) => item.contentId === "venue-1")?.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ field_name: "title" })]),
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

function completeCoverage() {
  return new Map(
    CONTENT_LOCALES.map((locale) => [
      locale,
      new Set(["title", "description"]),
    ]),
  );
}

describe("translation sweep durability", () => {
  it("rewrites every event locale while source-language detection is pending", () => {
    expect(
      getMissingTranslationLocales(
        "event",
        null,
        [{ field_name: "title" }, { field_name: "description" }],
        completeCoverage(),
      ),
    ).toEqual(CONTENT_LOCALES);
  });

  it("does not rewrite complete coverage after the event source locale is known", () => {
    expect(
      getMissingTranslationLocales(
        "event",
        "vi",
        [{ field_name: "title" }, { field_name: "description" }],
        completeCoverage(),
      ),
    ).toEqual([]);
  });
});

const item = {
  sourceUpdatedAt: "2026-08-28T04:00:00.000Z",
  fields: [
    { field_name: "title", text: "Corrected title" },
    { field_name: "story_content", text: "Corrected facts" },
  ],
};

describe("translation source revision guard", () => {
  it("accepts only the exact source revision and field values collected for work", () => {
    expect(translationSourceStillMatches(item, {
      updated_at: item.sourceUpdatedAt,
      title: "Corrected title",
      story_content: "Corrected facts",
    })).toBe(true);

    expect(translationSourceStillMatches(item, {
      updated_at: "2026-08-28T04:01:00.000Z",
      title: "Corrected title",
      story_content: "Corrected facts",
    })).toBe(false);

    expect(translationSourceStillMatches(item, {
      updated_at: item.sourceUpdatedAt,
      title: "Old title",
      story_content: "Corrected facts",
    })).toBe(false);
  });

  it("requeues translation coverage older than the source revision", () => {
    expect(translationCoverageIsCurrent(
      "2026-08-28T03:59:59.999Z",
      item.sourceUpdatedAt,
      "auto"
    )).toBe(false);
    expect(translationCoverageIsCurrent(
      item.sourceUpdatedAt,
      item.sourceUpdatedAt,
      "auto"
    )).toBe(true);
    expect(translationCoverageIsCurrent(null, item.sourceUpdatedAt, "auto")).toBe(false);
  });

  it("keeps stale human-owned rows blocked from automatic replacement", () => {
    expect(translationCoverageIsCurrent(
      "2026-08-28T03:59:59.999Z",
      item.sourceUpdatedAt,
      "reviewed"
    )).toBe(true);
    expect(translationCoverageIsCurrent(null, item.sourceUpdatedAt, "edited")).toBe(true);
  });

  it("keeps legacy automatic coverage usable when no source revision exists", () => {
    expect(translationCoverageIsCurrent("not-a-date", null, "auto")).toBe(true);
  });

  it("compares modern news preflight to its factual marker, not generic row churn", () => {
    expect(blogTranslationSourceStillMatches(item, {
      source: "news_scrape",
      source_urls: [{ content_updated_at: item.sourceUpdatedAt }],
      updated_at: "2026-08-28T05:00:00.000Z",
      title: "Corrected title",
      story_content: "Corrected facts",
    })).toBe(true);

    expect(blogTranslationSourceStillMatches(item, {
      source: "news_scrape",
      source_urls: [{ content_updated_at: "2026-08-28T05:00:00.000Z" }],
      updated_at: "2026-08-28T05:00:00.000Z",
      title: "Corrected title",
      story_content: "Corrected facts",
    })).toBe(false);
  });
});


describe("automatically published event recap translations", () => {
  it("includes published recaps stored as drafts, while excluding unpublished drafts", async () => {
    const post = { id: "recap", event_id: "event", status: "draft", recap_published_at: "2026-09-01T12:00:00Z", title: "Event recap", story_content: "Recorded discussion", technical_content: "", meta_description: "Meetup in Đà Lạt", source: "manual", source_locale: "en", updated_at: "2026-09-02T12:00:00Z" };
    const client = { from: vi.fn((table: string) => makeBuilder({ data: table === "blog_posts" ? [post, { ...post, id: "unpublished", recap_published_at: null }, { ...post, id: "ordinary-draft", event_id: null }] : [], error: null })) } as unknown as TestClient;
    const work = await collectTranslationWork(client, 20);
    expect(work.filter((item) => item.contentType === "blog").map((item) => item.contentId)).toEqual(["recap"]);
    expect(work.find((item) => item.contentId === "recap")?.sourceUpdatedAt).toBe(new Date(post.updated_at).toISOString());
  });
});
