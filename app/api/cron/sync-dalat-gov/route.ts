import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchGovArticles } from "@/lib/import/processors/dalat-gov";
import { recordImportRun, isRepeatZero } from "@/lib/import/run-log";
import { createEmptyResult } from "@/lib/import/utils";
import { sendTelegram } from "@/lib/alerts/telegram";

// Allow longer execution time for scraping
export const maxDuration = 300;

/**
 * Cron job to scrape events from dalat-info.gov.vn
 * Runs daily at 8 AM Vietnam time (1 UTC)
 *
 * Zero-cost pipeline (see docs/superpowers/specs/2026-07-09-zero-cost-scraping-design.md):
 * this leg only SCRAPES and ENQUEUES raw articles into import_queue.
 * AI extraction + translation happen on the Mac mini worker
 * (scripts/import-worker/worker.ts) using the Claude subscription — the
 * metered Anthropic API is no longer called here.
 *
 * Also enqueues one synthetic "canary" article per day; health-check
 * asserts the canary hatched into a draft event, proving the whole
 * scrape → queue → extract → insert chain end to end.
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

  console.log("[sync-dalat-gov] Starting dalat-info.gov.vn scrape...");

  const startedAt = new Date();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 1. Fetch articles from gov.vn categories
    const articles = await fetchGovArticles();

    // 2. Enqueue raw articles (idempotent: same URL never double-queues,
    //    and an already-processed row keeps its done/failed status)
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
    const rows = [
      ...articles.map((article) => ({
        source: "dalat-gov",
        type: "url",
        source_uid: article.url,
        payload: article,
      })),
      canaryRow(today),
    ];

    const { data: inserted, error } = await supabase
      .from("import_queue")
      .upsert(rows, {
        onConflict: "source,source_uid",
        ignoreDuplicates: true,
      })
      .select("id, source");

    // Enqueue failure must be LOUD — a dead queue is a dead pipeline.
    if (error) throw new Error(`Queue upsert failed: ${error.message}`);

    const enqueued = (inserted ?? []).filter((r) => r.source === "dalat-gov").length;

    // 3. Heartbeat (source: dalat-gov = the scrape leg). The Telegram digest
    //    for actual imports comes from the Mac mini worker, not this leg.
    const result = createEmptyResult();
    result.processed = enqueued;
    result.skipped = articles.length - enqueued;
    const repeatZero = await isRepeatZero(supabase, "dalat-gov", articles.length);
    await recordImportRun(supabase, "dalat-gov", startedAt, articles.length, result);
    if (repeatZero) {
      await sendTelegram(
        "🚨 <b>Import problem</b>\ndalat-gov: second consecutive zero-raw scrape — site structure may have changed"
      );
    }

    console.log("[sync-dalat-gov] Scrape complete:", {
      articlesScraped: articles.length,
      enqueued,
    });

    return NextResponse.json({
      success: true,
      articlesScraped: articles.length,
      enqueued,
    });
  } catch (error) {
    console.error("[sync-dalat-gov] Error:", error);
    await sendTelegram(
      `🚨 <b>Import problem</b>\ndalat-gov scrape leg failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return NextResponse.json(
      {
        error: "Scrape failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * One synthetic Vietnamese article per day. The worker extracts it like any
 * real article (no special-casing in the AI path) but imports it as a
 * permanent draft. Health-check asserts it hatched, then deletes it.
 */
function canaryRow(today: string) {
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const eventDate = tomorrow.toISOString().slice(0, 10);
  const [y, m, d] = eventDate.split("-");
  return {
    source: "canary",
    type: "text",
    source_uid: `canary-${today}`,
    payload: {
      url: `https://dalat.app/canary/${today}`,
      title: `Canary pipeline check ${today}`,
      publishDate: today,
      imageUrls: [],
      // Must read like a REAL event announcement — the extractor correctly
      // rejects "system check" prose, so a self-describing canary never
      // hatches (learned in the first smoke test).
      content:
        `Triển lãm ảnh "Canary Pipeline Check" sẽ khai mạc vào ngày ${d}/${m}/${y} ` +
        `lúc 09:00 tại Quảng trường Lâm Viên, Đà Lạt. ` +
        `Triển lãm trưng bày 31 bức ảnh về loài chim hoàng yến và vé vào cửa miễn phí. ` +
        `Ban tổ chức: dalat.app Pipeline Monitor.`,
    },
  };
}
