import { NextResponse } from "next/server";
import { createStaticClient } from "@/lib/supabase/server";
import { getBlogTranslationsBatchStatic } from "@/lib/translations";
import type { ContentLocale } from "@/lib/types";

const PAGE_SIZE = 25;

/**
 * Public paginated news feed — powers the "Load more" button on /news.
 * GET /api/news/posts?offset=25&locale=vi
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const locale = searchParams.get("locale") || "en";

    const supabase = createStaticClient();
    if (!supabase) {
      console.error("[news/posts] createStaticClient returned null — Supabase env missing");
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase.rpc("get_news_posts", {
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });

    if (error) {
      console.error("[news/posts] Failed to fetch news posts:", error);
      return NextResponse.json(
        { error: "Failed to fetch news posts" },
        { status: 500 }
      );
    }

    let posts = data ?? [];

    // Apply title translations for non-English locales
    if (posts.length > 0 && locale !== "en") {
      const translations = await getBlogTranslationsBatchStatic(
        posts.map((p: { id: string }) => p.id),
        locale as ContentLocale
      );
      posts = posts.map((p: { id: string; title: string }) => {
        const tr = translations.get(p.id);
        return tr?.title ? { ...p, title: tr.title } : p;
      });
    }

    return NextResponse.json(
      { posts },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      }
    );
  } catch (error) {
    console.error("[news/posts] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
