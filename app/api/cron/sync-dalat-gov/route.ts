import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchGovArticles,
  processGovArticles,
} from "@/lib/import/processors/dalat-gov";

// Allow longer execution time for scraping + AI extraction
export const maxDuration = 300;

/**
 * Cron job to scrape events from dalat-info.gov.vn
 * Runs daily at 8 AM Vietnam time (1 UTC)
 *
 * Process:
 * 1. Scrape recent articles from du-lich and van-hoa categories
 * 2. Use Claude to extract event information from Vietnamese prose
 * 3. Deduplicate against existing events
 * 4. Import new events with translations
 */
export async function GET(request: Request) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[sync-dalat-gov] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.log("[sync-dalat-gov] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[sync-dalat-gov] Starting dalat-info.gov.vn event scrape...");

  try {
    // 1. Fetch articles from gov.vn categories
    const articles = await fetchGovArticles();

    if (articles.length === 0) {
      console.log("[sync-dalat-gov] No articles found");
      return NextResponse.json({
        success: true,
        message: "No articles found",
        articlesScraped: 0,
        eventsImported: 0,
      });
    }

    console.log(`[sync-dalat-gov] Scraped ${articles.length} articles`);

    // 2. Process articles and extract events
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result = await processGovArticles(supabase, articles);

    console.log("[sync-dalat-gov] Scrape complete:", {
      articlesScraped: articles.length,
      eventsImported: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });

    // Log details for debugging
    if (result.details.length > 0) {
      console.log("[sync-dalat-gov] Details:", result.details.slice(0, 30));
    }

    return NextResponse.json({
      success: true,
      articlesScraped: articles.length,
      eventsImported: result.processed,
      skipped: result.skipped,
      errors: result.errors,
      details: result.details.slice(0, 50),
    });
  } catch (error) {
    console.error("[sync-dalat-gov] Error:", error);
    return NextResponse.json(
      {
        error: "Scrape failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
