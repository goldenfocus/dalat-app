import { describe, expect, it } from "vitest";
import {
  classifySourcePage,
  isHomepagePath,
  isHomepageRedirect,
  shouldUnlistForRemovedSource,
} from "./source-removal";

const LULU =
  "https://lululola.com.vn/acoustic-live-band-02112026-pd680741e1c8a17";

describe("isHomepageRedirect", () => {
  it("treats a product page answered by the homepage as removed", () => {
    expect(isHomepageRedirect(LULU, "https://lululola.com.vn/")).toBe(true);
    expect(isHomepageRedirect(LULU, "https://www.lululola.com.vn")).toBe(true);
    expect(isHomepageRedirect(LULU, "https://lululola.com.vn/vi/")).toBe(true);
    expect(
      isHomepageRedirect(
        "https://maylangthang.com.vn/shows/tp-2011",
        "https://maylangthang.com.vn/index.html",
      ),
    ).toBe(true);
  });

  it("does not flag the page itself, a moved page, or a homepage source", () => {
    expect(isHomepageRedirect(LULU, LULU)).toBe(false);
    expect(
      isHomepageRedirect(LULU, LULU.replace("lululola", "www.lululola")),
    ).toBe(false);
    expect(
      isHomepageRedirect(
        "https://maylangthang.com.vn/shows/tp-2011",
        "https://maylangthang.com.vn/shows/tp-2011/",
      ),
    ).toBe(false);
    expect(
      isHomepageRedirect(
        LULU,
        "https://lululola.com.vn/acoustic-live-band-02112026-pd99",
      ),
    ).toBe(false);
    expect(
      isHomepageRedirect(
        "https://lululola.com.vn/",
        "https://lululola.com.vn/",
      ),
    ).toBe(false);
  });

  it("recognises homepage paths", () => {
    for (const path of [
      "/",
      "",
      "/home",
      "/vi",
      "/en/",
      "/index.php",
      "/trang-chu",
    ]) {
      expect(isHomepagePath(path || "/")).toBe(true);
    }
    for (const path of ["/shows/tp-2011", "/show-dien", "/vi/shows/x"]) {
      expect(isHomepagePath(path)).toBe(false);
    }
  });
});

describe("classifySourcePage", () => {
  it("separates removed pages from transient failures", () => {
    expect(
      classifySourcePage(LULU, {
        ok: true,
        finalUrl: "https://lululola.com.vn/",
      }),
    ).toMatchObject({
      state: "removed",
    });
    expect(
      classifySourcePage(LULU, {
        ok: false,
        error: new Error("Source returned HTTP 404"),
      }),
    ).toEqual({ state: "removed", evidence: "HTTP 404" });
    expect(
      classifySourcePage(LULU, {
        ok: false,
        error: new Error("Source returned HTTP 503"),
      }),
    ).toMatchObject({ state: "unknown" });
    expect(
      classifySourcePage(LULU, {
        ok: false,
        error: new Error("The operation was aborted"),
      }),
    ).toMatchObject({ state: "unknown" });
    expect(classifySourcePage(LULU, { ok: true, finalUrl: LULU })).toEqual({
      state: "live",
    });
  });
});

describe("shouldUnlistForRemovedSource", () => {
  const since = "2026-10-30T10:17:11Z";
  const night = "2026-11-02T12:30:00Z";
  it("waits until the removal persisted and the night is close", () => {
    // Daily cron 00:40Z: Oct 31 run is 60h out -> keep.
    expect(
      shouldUnlistForRemovedSource({
        unavailableSince: since,
        startsAt: night,
        now: new Date("2026-10-31T00:40:00Z"),
      }),
    ).toBe(false);
    // Nov 1 run is ~36h out (last run before 24h) -> unlist.
    expect(
      shouldUnlistForRemovedSource({
        unavailableSince: since,
        startsAt: night,
        now: new Date("2026-11-01T00:40:00Z"),
      }),
    ).toBe(true);
  });
  it("never unlists on a first or fresh observation", () => {
    expect(
      shouldUnlistForRemovedSource({
        unavailableSince: null,
        startsAt: night,
        now: new Date("2026-11-02T00:40:00Z"),
      }),
    ).toBe(false);
    expect(
      shouldUnlistForRemovedSource({
        unavailableSince: "2026-11-01T20:00:00Z",
        startsAt: night,
        now: new Date("2026-11-02T00:40:00Z"),
      }),
    ).toBe(false);
  });
});
