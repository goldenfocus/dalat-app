import { NextResponse } from "next/server";

const APIFY_API = "https://api.apify.com/v2";
const TASK_NAME = "dalat-venue-events-daily";

interface ApifyTask {
  id: string;
  name: string;
}

/**
 * Trigger an immediate run of the scraping task
 */
export async function POST() {
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
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
