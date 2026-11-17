import { describe, expect, it } from "vitest";
import {
  MOMENT_FEED_IMAGE,
  MOMENT_THUMB_IMAGE,
  responsiveImageSources,
} from "./image-sources";

const r2 = "https://cdn.dalat.app/moments/a.jpg";
const supabase = "https://abc.supabase.co/storage/v1/object/public/moments/a.jpg";

describe("responsiveImageSources", () => {
  it("builds a width ladder with matching sizes for R2 images", () => {
    const out = responsiveImageSources(r2, MOMENT_FEED_IMAGE);
    const candidates = out.srcSet!.split(", ");
    expect(candidates).toHaveLength(MOMENT_FEED_IMAGE.widths.length);
    MOMENT_FEED_IMAGE.widths.forEach((w, i) => {
      expect(candidates[i]).toContain(`width=${w},`);
      expect(candidates[i]).toMatch(new RegExp(` ${w}w$`));
      expect(candidates[i]).toContain("quality=70");
      expect(candidates[i]).toContain("format=auto");
      expect(candidates[i]).toContain(`/${r2}`);
    });
    expect(out.sizes).toBe(MOMENT_FEED_IMAGE.sizes);
  });

  it("uses a small fallback src, never 1920", () => {
    const feed = responsiveImageSources(r2, MOMENT_FEED_IMAGE);
    expect(feed.src).toContain("width=768,");
    const thumb = responsiveImageSources(supabase, MOMENT_THUMB_IMAGE);
    expect(thumb.src).toContain("width=360,");
    for (const profile of [MOMENT_FEED_IMAGE, MOMENT_THUMB_IMAGE]) {
      expect(Math.max(...profile.widths)).toBeLessThan(1920);
      expect(responsiveImageSources(r2, profile).srcSet).not.toContain("1920");
    }
  });

  it("keeps the fallback src inside its own srcset", () => {
    for (const profile of [MOMENT_FEED_IMAGE, MOMENT_THUMB_IMAGE]) {
      expect(profile.widths).toContain(profile.fallbackWidth);
    }
  });

  it("returns a single candidate for URLs the CDN cannot resize", () => {
    const external = "https://example.com/photo.jpg";
    expect(responsiveImageSources(external, MOMENT_THUMB_IMAGE)).toEqual({ src: external });
  });

  it("does not double-wrap an already optimized URL", () => {
    const wrapped = `/cdn-cgi/image/width=1080/${r2}`;
    expect(responsiveImageSources(wrapped, MOMENT_FEED_IMAGE)).toEqual({ src: wrapped });
  });
});
