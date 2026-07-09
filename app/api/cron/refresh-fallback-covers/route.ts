import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface CreditedRow {
  event_id: string;
  event_title: string;
  event_slug: string;
  moment_id: string;
  photographer_id: string;
  photographer_username: string;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[refresh-fallback-covers] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("refresh_fallback_covers");

    if (error) {
      console.error("[refresh-fallback-covers] RPC error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify photographers whose moment became a cover — once per
    // photographer+moment, even when the same photo fronts several
    // occurrences of a weekly series.
    const credited = (data?.credited ?? []) as CreditedRow[];
    const seen = new Set<string>();
    const unique = credited.filter((c) => {
      const key = `${c.photographer_id}:${c.moment_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length > 0) {
      const { error: notifError } = await supabase.from("notifications").insert(
        unique.map((c) => ({
          user_id: c.photographer_id,
          type: "photo_featured",
          title: "Your photo is the face of an event 📸",
          body: `Your shot is now the cover for "${c.event_title}". Nice one!`,
          primary_action_url: `/events/${c.event_slug}`,
          primary_action_label: "See it live",
          metadata: { event_id: c.event_id, moment_id: c.moment_id },
        }))
      );
      if (notifError) {
        console.error("[refresh-fallback-covers] notifications failed:", notifError);
      }
    }

    console.log("[refresh-fallback-covers] Result:", {
      updated: data?.updated,
      notified: unique.length,
    });
    return NextResponse.json({ ...data, notified: unique.length });
  } catch (err) {
    console.error("[refresh-fallback-covers] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
