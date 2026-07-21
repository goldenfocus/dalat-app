import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findAvailableTribeSlug, isReservedTribeSlug, normalizeTribeSlug } from "./slug";

/** Minimal stand-in for the one query findAvailableTribeSlug makes. */
function fakeSupabase(existingSlugs: string[]) {
  return {
    from: () => ({
      select: () => ({
        or: (filter: string) => {
          const base = filter.match(/slug\.eq\.([^,]+)/)![1];
          return Promise.resolve({
            data: existingSlugs
              .filter((s) => s === base || s.startsWith(`${base}-`))
              .map((slug) => ({ slug })),
            error: null,
          });
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("normalizeTribeSlug", () => {
  it("strips diacritics and punctuation", () => {
    expect(normalizeTribeSlug("Phố Bên Đồi!")).toBe("pho-ben-doi");
  });

  it("returns empty string when there is nothing latinizable", () => {
    expect(normalizeTribeSlug("동호회")).toBe("");
  });
});

describe("isReservedTribeSlug", () => {
  it("flags route segments that live under /tribes/", () => {
    expect(isReservedTribeSlug("new")).toBe(true);
    expect(isReservedTribeSlug("join")).toBe(true);
    expect(isReservedTribeSlug("dalat-cycling-group")).toBe(false);
  });
});

describe("findAvailableTribeSlug", () => {
  it("gives a clean slug when nothing conflicts", async () => {
    const slug = await findAvailableTribeSlug(fakeSupabase([]), "DaLat Cycling Group");
    expect(slug).toBe("dalat-cycling-group");
  });

  it("suffixes -2 only once the clean slug is taken", async () => {
    const slug = await findAvailableTribeSlug(
      fakeSupabase(["dalat-cycling-group"]),
      "DaLat Cycling Group"
    );
    expect(slug).toBe("dalat-cycling-group-2");
  });

  it("skips past suffixes already in use", async () => {
    const slug = await findAvailableTribeSlug(
      fakeSupabase(["run-club", "run-club-2", "run-club-3"]),
      "Run Club"
    );
    expect(slug).toBe("run-club-4");
  });

  it("never hands back a slug that a route would shadow", async () => {
    expect(await findAvailableTribeSlug(fakeSupabase([]), "New")).toBe("new-2");
  });

  it("falls back to a usable base when the name romanizes to nothing", async () => {
    expect(await findAvailableTribeSlug(fakeSupabase([]), "동호회")).toBe("tribe");
  });
});
