import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";

const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/moments/process
 * Triggers AI processing for a newly created moment.
 * Fire-and-forget - doesn't block moment creation.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check - prevent unauthorized access
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Rate limiting to prevent abuse
    const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
      p_action: 'moment_process',
      p_limit: RATE_LIMIT,
      p_window_ms: RATE_WINDOW_MS,
    });

    if (rateError) {
      console.error("[moments/process] Rate limit check failed:", rateError);
    } else if (!rateCheck?.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Try again later.",
          remaining: 0,
          reset_at: rateCheck?.reset_at,
        },
        { status: 429 }
      );
    }

    const { momentId, momentIds } = await request.json();

    // Support single or batch processing
    const idsToProcess: string[] = momentIds || (momentId ? [momentId] : []);

    if (idsToProcess.length === 0) {
      return NextResponse.json(
        { error: "Missing momentId or momentIds" },
        { status: 400 }
      );
    }

    // Verify the user owns these moments or is admin
    const { data: moments, error: momentError } = await supabase
      .from("moments")
      .select("id, user_id")
      .in("id", idsToProcess);

    if (momentError || !moments || moments.length === 0) {
      return NextResponse.json(
        { error: "Moments not found" },
        { status: 404 }
      );
    }

    // Check ownership — if any moment isn't theirs, verify admin role
    const ownsMoments = moments.every((m) => m.user_id === user.id);
    if (!ownsMoments) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !["superadmin", "admin", "moderator"].includes(profile.role)) {
        return NextResponse.json(
          { error: "Not authorized to process these moments" },
          { status: 403 }
        );
      }
    }

    // Trigger Inngest jobs for all moments in one batch
    await inngest.send(
      moments.map((m) => ({
        name: "moment/process-metadata" as const,
        data: { momentId: m.id },
      }))
    );

    return NextResponse.json({ success: true, count: moments.length });
  } catch (error) {
    console.error("Failed to trigger moment processing:", error);
    // Don't fail the request - processing is non-critical
    return NextResponse.json(
      { error: "Failed to trigger processing" },
      { status: 500 }
    );
  }
}
