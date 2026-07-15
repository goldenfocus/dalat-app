import { describe, it, expect } from "vitest";
import { coverPalette, coverGradientCss } from "./cover-palette";

describe("coverPalette", () => {
  it("is deterministic for the same seed", () => {
    const a = coverPalette("my-first-post");
    const b = coverPalette("my-first-post");
    expect(a).toEqual(b);
  });

  it("returns a complete palette for any seed, including empty and Vietnamese", () => {
    for (const seed of ["", "a", "đà-lạt-mùa-hoa-dã-quỳ", "x".repeat(500)]) {
      const p = coverPalette(seed);
      expect(p.from).toMatch(/^hsl\(/);
      expect(p.to).toMatch(/^hsl\(/);
      expect(p.accent).toMatch(/^hsl\(/);
      expect(p.glyph.length).toBeGreaterThan(0);
    }
  });

  it("spreads seeds across multiple buckets", () => {
    const glyphs = new Set(
      Array.from({ length: 50 }, (_, i) => coverPalette(`post-${i}`).glyph)
    );
    expect(glyphs.size).toBeGreaterThan(5);
  });
});

describe("coverGradientCss", () => {
  it("builds a 135deg linear-gradient from the palette pair", () => {
    const { from, to } = coverPalette("some-post");
    expect(coverGradientCss("some-post")).toBe(
      `linear-gradient(135deg, ${from}, ${to})`
    );
  });
});
