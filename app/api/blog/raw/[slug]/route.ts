import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BlogPostFull, BlogPostRawResponse } from "@/lib/types/blog";
import { generateBlogArticleSchema } from "@/lib/structured-data";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * Machine-readable blog post endpoint
 * Returns JSON with human markdown, technical markdown, keywords, and structured data
 * Designed for AI crawlers and SEO tools
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_blog_post_by_slug", {
      p_slug: slug,
    });

    if (error || !data || data.length === 0) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    const post = data[0] as BlogPostFull;

    // Generate structured data
    const structuredData = generateBlogArticleSchema(post, "en");

    const response: BlogPostRawResponse = {
      article: {
        title: post.title,
        version: post.version,
        published: post.published_at,
        category: post.category_slug,
        slug: post.slug,
      },
      content: {
        human_markdown: post.story_content,
        technical_markdown: post.technical_content,
        keywords: post.seo_keywords || [],
        related: post.related_feature_slugs || [],
      },
      structured_data: structuredData,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[blog/raw] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
