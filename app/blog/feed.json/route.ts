import { createStaticClient } from "@/lib/supabase/server";

export const revalidate = 3600; // 1 hour

const SITE_URL = "https://dalat.app";

/**
 * JSON Feed 1.1 — machine-readable blog feed for AI crawlers and feed readers.
 * Spec: https://www.jsonfeed.org/version/1.1/
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const supabase = createStaticClient();
  if (!supabase) {
    return Response.json({ error: "Service unavailable" }, { status: 503 });
  }

  let query = supabase
    .from("blog_posts")
    .select(`
      id,
      slug,
      title,
      story_content,
      meta_description,
      seo_keywords,
      cover_image_url,
      cover_image_alt,
      published_at,
      created_at,
      blog_categories (
        slug,
        name
      )
    `)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(50);

  if (category) {
    query = query.eq("blog_categories.slug", category);
  }

  const { data: posts, error } = await query;

  if (error) {
    console.error("JSON Feed error:", error);
    return Response.json({ error: "Feed generation failed" }, { status: 500 });
  }

  const items = (posts || []).map((post) => {
    const cat = Array.isArray(post.blog_categories)
      ? post.blog_categories[0]
      : post.blog_categories;
    const categorySlug = (cat as { slug: string } | null)?.slug ?? "changelog";
    const categoryName = (cat as { name: string } | null)?.name;
    const postUrl = `${SITE_URL}/en/blog/${categorySlug}/${post.slug}`;

    return {
      id: postUrl,
      url: postUrl,
      title: post.title,
      content_text: post.story_content,
      summary: post.meta_description || post.story_content.split("\n\n")[0].replace(/[#*_`]/g, "").slice(0, 300),
      date_published: post.published_at || post.created_at,
      image: post.cover_image_url || undefined,
      tags: [
        ...(categoryName ? [categoryName] : []),
        ...(post.seo_keywords || []),
      ],
      _dalat: {
        raw_api: `${SITE_URL}/api/blog/raw/${post.slug}`,
        category: categorySlug,
      },
    };
  });

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: category
      ? `dalat.app Blog — ${category.charAt(0).toUpperCase() + category.slice(1)}`
      : "dalat.app Blog",
    home_page_url: `${SITE_URL}/blog`,
    feed_url: category
      ? `${SITE_URL}/blog/feed.json?category=${category}`
      : `${SITE_URL}/blog/feed.json`,
    description: "Guides, stories, and updates about Đà Lạt, Vietnam",
    icon: `${SITE_URL}/icon-512.png`,
    favicon: `${SITE_URL}/icon.png`,
    language: "en",
    items,
  };

  return Response.json(feed, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Content-Type": "application/feed+json; charset=utf-8",
    },
  });
}
