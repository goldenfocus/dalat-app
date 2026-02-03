import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  fetchWellhoodsEvents,
  processWellhoodsEvents,
} from "@/lib/import/processors/wellhoods";

// Allow longer execution for batch imports
export const maxDuration = 120;

/**
 * Manual Wellhoods sync - imports all events from Wellhoods
 * Requires admin authentication
 */
export async function POST() {
  // Require authentication
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Check if user is admin
  const { data: profile } = await serverSupabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  console.log("[wellhoods-sync] Starting manual sync by", user.email);

  try {
    // Fetch all events from Wellhoods
    const events = await fetchWellhoodsEvents();

    if (events.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No events found on Wellhoods",
        processed: 0,
        skipped: 0,
        errors: 0,
      });
    }

    console.log(`[wellhoods-sync] Found ${events.length} events`);

    // Filter to future events only
    const now = new Date();
    const futureEvents = events.filter((event) => {
      const eventDate = new Date(event.eventDate);
      return eventDate >= now;
    });

    console.log(`[wellhoods-sync] ${futureEvents.length} future events to process`);

    if (futureEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No future events to import",
        processed: 0,
        skipped: events.length,
        errors: 0,
      });
    }

    // Process events with service role client for full access
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const result = await processWellhoodsEvents(supabase, futureEvents, user.id);

    console.log("[wellhoods-sync] Sync complete:", {
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });

    return NextResponse.json({
      success: true,
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
      details: result.details.slice(0, 50),
    });
  } catch (error) {
    console.error("[wellhoods-sync] Error:", error);
    return NextResponse.json(
      {
        error: "Sync failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
