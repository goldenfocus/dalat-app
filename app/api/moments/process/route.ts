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

    const { momentId } = await request.json();

    if (!momentId) {
      return NextResponse.json(
        { error: "Missing momentId" },
        { status: 400 }
      );
    }

    // Verify the user owns this moment or is admin
    const { data: moment, error: momentError } = await supabase
      .from("moments")
      .select("created_by")
      .eq("id", momentId)
      .single();

    if (momentError || !moment) {
      return NextResponse.json(
        { error: "Moment not found" },
        { status: 404 }
      );
    }

    if (moment.created_by !== user.id) {
      // Check if user is admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !["superadmin", "admin", "moderator"].includes(profile.role)) {
        return NextResponse.json(
          { error: "Not authorized to process this moment" },
          { status: 403 }
        );
      }
    }

    // Trigger the Inngest job to process the moment
    await inngest.send({
      name: "moment/process-metadata",
      data: { momentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to trigger moment processing:", error);
    // Don't fail the request - processing is non-critical
    return NextResponse.json(
      { error: "Failed to trigger processing" },
      { status: 500 }
    );
  }
}
