import { describe, expect, it } from "vitest";
import { cloudflareLoader, optimizedImageUrl } from "./image-cdn";
import { heroImageSources } from "./events/hero-image";

const source = "https://cdn.dalat.app/event-materials/event/hero.png";

describe("image delivery", () => {
  it("negotiates compression and enables same-zone recovery for every responsive hero candidate", () => {
    const sources = heroImageSources(source);
    expect(sources.src).toContain("format=auto");
    expect(sources.src).toContain("onerror=redirect");
    for (const candidate of sources.srcSet!.split(/, (?=\/)/)) {
      expect(candidate).toContain("format=auto");
      expect(candidate).toContain("onerror=redirect");
    }
  });
  it("uses the same recovery in the Next image loader", () => {
    expect(cloudflareLoader({ src: source, width: 640 })).toContain("onerror=redirect");
  });
  it("preserves direct and already optimized sources", () => {
    const external = "https://example.com/event.jpg";
    expect(heroImageSources(external)).toEqual({ src: external });
    const optimized = optimizedImageUrl(source, { width: 640 })!;
    expect(optimizedImageUrl(optimized)).toBe(optimized);
    expect(optimizedImageUrl(source, { width: 640, format: "original" })).not.toContain("format=");
  });
  it("does not request same-zone redirects for legacy cross-zone storage", () => {
    expect(optimizedImageUrl("https://example.supabase.co/storage/v1/object/public/event.jpg", { width: 640 }))
      .not.toContain("onerror=redirect");
  });
});
