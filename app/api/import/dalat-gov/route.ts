import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  fetchGovArticles,
  processGovArticles,
} from "@/lib/import/processors/dalat-gov";

// Allow longer execution time for scraping + AI extraction
export const maxDuration = 300;

/**
 * Manual trigger for dalat-info.gov.vn event scraping
 * POST /api/import/dalat-gov
 */
export async function POST() {
  // Verify admin access
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  console.log("[dalat-gov] Manual sync triggered by", user.email);

  try {
    // 1. Fetch articles from gov.vn categories
    const articles = await fetchGovArticles();

    if (articles.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No articles found",
        articlesScraped: 0,
        eventsImported: 0,
      });
    }

    console.log(`[dalat-gov] Scraped ${articles.length} articles`);

    // 2. Process articles and extract events
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result = await processGovArticles(serviceClient, articles, user.id);

    console.log("[dalat-gov] Manual sync complete:", {
      articlesScraped: articles.length,
      eventsImported: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });

    return NextResponse.json({
      success: true,
      articlesScraped: articles.length,
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
      details: result.details.slice(0, 50),
    });
  } catch (error) {
    console.error("[dalat-gov] Manual sync error:", error);
    return NextResponse.json(
      {
        error: "Sync failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
