import type { BlogPostWithCategory } from "@/lib/types/blog";

const SITE_URL = "https://dalat.app";
const SITE_NAME = "dalat.app";

/**
 * Generate RSS 2.0 feed XML for blog posts
 */
export function generateRssFeed(
  posts: BlogPostWithCategory[],
  options: {
    title?: string;
    description?: string;
    category?: string;
  } = {}
): string {
  const {
    title = `${SITE_NAME} Blog`,
    description = "Product updates, release notes, and stories from the dalat.app team.",
    category,
  } = options;

  const feedUrl = category
    ? `${SITE_URL}/blog/rss.xml?category=${category}`
    : `${SITE_URL}/blog/rss.xml`;

  const items = posts
    .map((post) => {
      const postUrl = `${SITE_URL}/en/blog/${post.category_slug || "changelog"}/${post.slug}`;
      const pubDate = post.published_at
        ? new Date(post.published_at).toUTCString()
        : new Date().toUTCString();

      // Extract first paragraph for description
      const description = post.story_content
        .split("\n\n")[0]
        .replace(/[#*_`]/g, "")
        .slice(0, 300);

      return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${description}]]></description>
      ${post.category_name ? `<category>${post.category_name}</category>` : ""}
      ${post.cover_image_url ? `<enclosure url="${post.cover_image_url}" type="image/png" />` : ""}
    </item>`;
    })
    .join("");

  const lastBuildDate = posts.length > 0 && posts[0].published_at
    ? new Date(posts[0].published_at).toUTCString()
    : new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <link>${SITE_URL}/blog</link>
    <description>${description}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/icon-512.png</url>
      <title>${title}</title>
      <link>${SITE_URL}/blog</link>
    </image>
    ${items}
  </channel>
</rss>`;
}
