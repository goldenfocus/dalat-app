import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Get import history - events that were imported from external platforms
 */
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: events, error } = await supabase
      .from("events")
      .select("id, slug, title, starts_at, source_platform, created_at, external_chat_url")
      .not("source_platform", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("History fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: events || [] });
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
