import { describe, expect, it } from "vitest";
import type { BlogPostWithCategory } from "@/lib/types/blog";
import { generateRssFeed } from "@/lib/blog/rss";

const post: BlogPostWithCategory = {
  id: "post-1",
  slug: "preserved-article",
  title: "Preserved article",
  story_content: "A sourced article.",
  cover_image_url: null,
  cover_image_alt: null,
  cover_image_description: null,
  cover_image_keywords: null,
  cover_image_colors: null,
  version: null,
  source: "manual",
  published_at: "2026-08-20T00:00:00.000Z",
  category_slug: "guides",
  category_name: "Guides",
  like_count: 0,
};

describe("blog RSS canonical URLs", () => {
  it("uses the unprefixed English article URL and an existing icon", () => {
    const rss = generateRssFeed([post]);

    expect(rss).toContain(
      "<link>https://dalat.app/blog/guides/preserved-article</link>"
    );
    expect(rss).not.toContain("https://dalat.app/en/blog/");
    expect(rss).toContain(
      "<url>https://dalat.app/android-chrome-512x512.png</url>"
    );
  });

  it("uses a correction timestamp for the channel freshness signal", () => {
    const rss = generateRssFeed([
      { ...post, updated_at: "2026-08-27T12:00:00.000Z" },
    ]);

    expect(rss).toContain("<lastBuildDate>Thu, 27 Aug 2026 12:00:00 GMT</lastBuildDate>");
  });
});
