import { describe, expect, it, vi } from "vitest";
import { resolveCanonicalEventSlug } from "./slug-resolution";

function mockFrom(handlers: { bySlug?: unknown[]; byPrevious?: unknown[] }) {
  const limit = vi.fn(async (n: number) => {
    void n;
    // The chain is built as eq().limit() or contains().limit(). Distinguish by the last filter.
    return {
      data:
        currentFilter === "slug"
          ? (handlers.bySlug ?? [])
          : (handlers.byPrevious ?? []),
      error: null,
    };
  });
  let currentFilter: "slug" | "previous" = "slug";
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string) => {
      if (col === "slug") currentFilter = "slug";
      return chain;
    }),
    contains: vi.fn((col: string) => {
      if (col === "previous_slugs") currentFilter = "previous";
      return chain;
    }),
    limit,
  };
  return {
    from: vi.fn(() => chain),
    chain,
  };
}

describe("resolveCanonicalEventSlug", () => {
  it("prefers the current slug when one exists", async () => {
    const sb = mockFrom({
      bySlug: [{ slug: "current" }],
      byPrevious: [{ slug: "other", status: "published" }],
    });
    await expect(resolveCanonicalEventSlug(sb, "current")).resolves.toBe(
      "current",
    );
    expect(sb.chain.contains).not.toHaveBeenCalled();
  });

  it("does not use .single(), so a miss cannot return HTTP 406", async () => {
    const sb = mockFrom({ bySlug: [], byPrevious: [] });
    await resolveCanonicalEventSlug(sb, "missing");
    expect(sb.chain.limit).toHaveBeenCalled();
    expect((sb.chain as { single?: unknown }).single).toBeUndefined();
  });

  it("redirects a previous slug to the published event", async () => {
    const sb = mockFrom({
      bySlug: [],
      byPrevious: [
        { slug: "draft-holder", status: "draft" },
        {
          slug: "le-khai-mac-festival-hoa-da-lat-lan-thu-xi-nam-2026",
          status: "published",
        },
      ],
    });
    await expect(
      resolveCanonicalEventSlug(
        sb,
        "le-khai-mac-festival-hoa-da-lat-lan-thu-xi-nam-2026-1",
      ),
    ).resolves.toBe("le-khai-mac-festival-hoa-da-lat-lan-thu-xi-nam-2026");
  });

  it("returns null when no event owns the slug", async () => {
    const sb = mockFrom({ bySlug: [], byPrevious: [] });
    await expect(
      resolveCanonicalEventSlug(sb, "no-such-event"),
    ).resolves.toBeNull();
  });
});
