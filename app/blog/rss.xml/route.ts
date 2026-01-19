import { createStaticClient } from "@/lib/supabase/server";
import { generateRssFeed } from "@/lib/blog/rss";
import type { BlogPostWithCategory } from "@/lib/types/blog";

export const revalidate = 3600; // Revalidate every hour

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const supabase = createStaticClient();
  if (!supabase) {
    return new Response("Service unavailable", { status: 503 });
  }

  // Fetch posts using direct query (can't use RPC without auth context)
  let query = supabase
    .from("blog_posts")
    .select(`
      id,
      slug,
      title,
      story_content,
      cover_image_url,
      version,
      source,
      published_at,
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

  const { data: postsData, error } = await query;

  if (error) {
    console.error("RSS feed error:", error);
    return new Response("Error generating feed", { status: 500 });
  }

  // Transform to BlogPostWithCategory format
  // Note: Supabase joins can return array or single object depending on relation
  const posts: BlogPostWithCategory[] = (postsData || []).map((post) => {
    const categories = post.blog_categories;
    const category = Array.isArray(categories) ? categories[0] : categories;
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      story_content: post.story_content,
      cover_image_url: post.cover_image_url,
      version: post.version,
      source: post.source,
      published_at: post.published_at,
      category_slug: (category as { slug: string } | null)?.slug ?? null,
      category_name: (category as { name: string } | null)?.name ?? null,
      like_count: 0, // Not needed for RSS
    };
  });

  const rss = generateRssFeed(posts, {
    category: category || undefined,
    title: category
      ? `dalat.app Blog - ${category.charAt(0).toUpperCase() + category.slice(1)}`
      : undefined,
  });

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
