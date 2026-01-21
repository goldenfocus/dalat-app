import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const APIFY_API = "https://api.apify.com/v2";
const TASK_NAME = "dalat-venue-events-daily";

interface ApifyTask {
  id: string;
  name: string;
}

const RATE_LIMIT = 5; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Trigger an immediate run of the scraping task
 */
export async function POST() {
  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Database-backed rate limiting
  const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
    p_action: 'import_schedule_run',
    p_limit: RATE_LIMIT,
    p_window_ms: RATE_WINDOW_MS,
  });

  if (rateError) {
    console.error("[import/schedule/run] Rate limit check failed:", rateError);
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

  try {
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        { error: "Apify not configured" },
        { status: 503 }
      );
    }

    // Get task ID
    const tasksResponse = await fetch(
      `${APIFY_API}/actor-tasks?token=${apiToken}`
    );

    if (!tasksResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch tasks" },
        { status: 502 }
      );
    }

    const tasksData = await tasksResponse.json();
    const task = tasksData.data?.items?.find(
      (t: ApifyTask) => t.name === TASK_NAME
    );

    if (!task) {
      return NextResponse.json(
        { error: "Scraping task not configured. Enable auto-scraping first." },
        { status: 404 }
      );
    }

    console.log(`Triggering manual run for task: ${task.id}`);

    // Trigger the task
    const runResponse = await fetch(
      `${APIFY_API}/actor-tasks/${task.id}/runs?token=${apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!runResponse.ok) {
      const err = await runResponse.text();
      console.error("Failed to trigger run:", err);
      return NextResponse.json(
        { error: "Failed to trigger run" },
        { status: 502 }
      );
    }

    const runData = await runResponse.json();
    console.log(`Run started: ${runData.data?.id}`);

    return NextResponse.json({
      success: true,
      runId: runData.data?.id,
      message: "Scraping task started. Events will appear shortly.",
    });
  } catch (error) {
    console.error("Run trigger error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
