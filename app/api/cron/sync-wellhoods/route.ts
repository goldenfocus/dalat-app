import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchWellhoodsEvents,
  processWellhoodsEvents,
} from "@/lib/import/processors/wellhoods";

// Allow longer execution time for batch imports
export const maxDuration = 120;

/**
 * Cron job to sync events from Wellhoods
 * Runs daily at 7 AM Vietnam time (0 UTC)
 *
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/sync-wellhoods",
 *     "schedule": "0 0 * * *"
 *   }]
 * }
 */
export async function GET(request: Request) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[sync-wellhoods] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.log("[sync-wellhoods] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[sync-wellhoods] Starting Wellhoods event sync...");

  try {
    // 1. Fetch all events from Wellhoods API
    const events = await fetchWellhoodsEvents();

    if (events.length === 0) {
      console.log("[sync-wellhoods] No events found on Wellhoods");
      return NextResponse.json({
        success: true,
        message: "No events to import",
        processed: 0,
        skipped: 0,
      });
    }

    console.log(`[sync-wellhoods] Found ${events.length} events on Wellhoods`);

    // 2. Filter to only future events
    const now = new Date();
    const futureEvents = events.filter((event) => {
      const eventDate = new Date(event.eventDate);
      return eventDate >= now;
    });

    console.log(`[sync-wellhoods] ${futureEvents.length} future events to process`);

    if (futureEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No future events to import",
        processed: 0,
        skipped: events.length,
      });
    }

    // 3. Process events (deduplication happens inside processWellhoodsEvents)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result = await processWellhoodsEvents(supabase, futureEvents);

    console.log("[sync-wellhoods] Sync complete:", {
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });

    // Log details for debugging
    if (result.details.length > 0) {
      console.log("[sync-wellhoods] Details:", result.details.slice(0, 20));
    }

    return NextResponse.json({
      success: true,
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
      details: result.details.slice(0, 50), // Limit details in response
    });
  } catch (error) {
    console.error("[sync-wellhoods] Error:", error);
    return NextResponse.json(
      {
        error: "Sync failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
