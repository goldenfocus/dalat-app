import { describe, expect, it } from "vitest";
import { CONTENT_LOCALES } from "@/lib/types";
import type { EventIndexingReadiness } from "@/lib/translations-readiness";
import {
  buildEventIndexingHealthProblem,
  summarizeEventIndexingHealth,
} from "./indexing-health";

function readiness(
  slug: string,
  readyLocales = [...CONTENT_LOCALES],
  blockingIssues: EventIndexingReadiness["content"]["blockingIssues"] = []
): EventIndexingReadiness {
  return {
    eventId: `${slug}-id`,
    slug,
    sourceLocale: "en",
    published: true,
    contentReady: blockingIssues.length === 0,
    content: {
      ready: blockingIssues.length === 0,
      blockingIssues,
      warnings: [],
      ogImageFallbackPath: `/events/${slug}/og-image`,
    },
    requiredFields: ["title", "description"],
    locales: CONTENT_LOCALES.map((locale) => ({
      locale,
      path: locale === "en" ? `/events/${slug}` : `/${locale}/events/${slug}`,
      isSourceLocale: locale === "en",
      translationReady: readyLocales.includes(locale),
      ready: readyLocales.includes(locale) && blockingIssues.length === 0,
      missingFields: readyLocales.includes(locale) ? [] : ["description"],
      nonSubstantiveFields: [],
      staleFields: [],
      translationUpdatedAt: null,
    })),
    readyLocales: blockingIssues.length === 0 ? readyLocales : [],
    readyPaths: [],
    allLocalesReady:
      blockingIssues.length === 0 && readyLocales.length === CONTENT_LOCALES.length,
    lastModified: "2026-08-27T00:00:00.000Z",
  };
}

describe("event indexing health", () => {
  it("reports a healthy all-language upcoming inventory", () => {
    const summary = summarizeEventIndexingHealth([
      readiness("flower-festival"),
      readiness("jazz-night"),
    ]);

    expect(summary).toMatchObject({ total: 2, allLocalesReady: 2, incomplete: 0 });
    expect(buildEventIndexingHealthProblem(summary)).toBeNull();
  });

  it("distinguishes translation gaps from source-content blockers", () => {
    const summary = summarizeEventIndexingHealth([
      readiness("missing-french", CONTENT_LOCALES.filter((locale) => locale !== "fr")),
      readiness("thin-copy", [...CONTENT_LOCALES], ["description_too_short"]),
    ]);
    const problem = buildEventIndexingHealthProblem(summary);

    expect(summary).toMatchObject({ total: 2, allLocalesReady: 0, incomplete: 2 });
    expect(summary.issues[0]).toMatchObject({
      slug: "missing-french",
      missingLocales: ["fr"],
      contentBlockingIssues: [],
    });
    expect(summary.issues[1]).toMatchObject({
      slug: "thin-copy",
      readyLocaleCount: 0,
      contentBlockingIssues: ["description_too_short"],
    });
    expect(problem).toContain("missing fr");
    expect(problem).toContain("description_too_short");
  });
});
