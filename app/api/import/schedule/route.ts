import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const APIFY_API = "https://api.apify.com/v2";
const TASK_NAME = "dalat-venue-events-daily";
const SCHEDULE_NAME = `${TASK_NAME}-schedule`;
const ACTOR_ID = "pratikdani/facebook-event-scraper";

interface ApifySchedule {
  id: string;
  name: string;
  isEnabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

interface ApifyTask {
  id: string;
  name: string;
  input?: {
    startUrls?: Array<{ url: string }>;
  };
}

/**
 * Get schedule status
 */
export async function GET() {
  try {
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        { error: "Apify not configured" },
        { status: 503 }
      );
    }

    // Get schedule info
    const schedulesResponse = await fetch(
      `${APIFY_API}/schedules?token=${apiToken}`
    );

    if (!schedulesResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch schedules" },
        { status: 502 }
      );
    }

    const schedulesData = await schedulesResponse.json();
    const schedule = schedulesData.data?.items?.find(
      (s: ApifySchedule) => s.name === SCHEDULE_NAME
    );

    // Get task info for venue count
    const tasksResponse = await fetch(
      `${APIFY_API}/actor-tasks?token=${apiToken}`
    );
    const tasksData = await tasksResponse.json();
    const task = tasksData.data?.items?.find(
      (t: ApifyTask) => t.name === TASK_NAME
    );

    // Count tracked venues from database or task input
    let venueCount = 0;
    if (task?.input?.startUrls) {
      venueCount = task.input.startUrls.length;
    } else {
      // Count from database - events with source_platform not null
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { count } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .not("source_platform", "is", null);
      venueCount = count || 0;
    }

    return NextResponse.json({
      enabled: schedule?.isEnabled || false,
      lastRun: schedule?.lastRunAt,
      nextRun: schedule?.nextRunAt,
      venueCount,
      taskId: task?.id,
      scheduleId: schedule?.id,
    });
  } catch (error) {
    console.error("Schedule status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Enable/disable schedule or create new one
 */
export async function POST(request: Request) {
  try {
    const { enabled } = await request.json();

    const apiToken = process.env.APIFY_API_TOKEN;
    const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;

    if (!apiToken) {
      return NextResponse.json(
        { error: "Apify not configured" },
        { status: 503 }
      );
    }

    // Get existing schedule
    const schedulesResponse = await fetch(
      `${APIFY_API}/schedules?token=${apiToken}`
    );
    const schedulesData = await schedulesResponse.json();
    const existingSchedule = schedulesData.data?.items?.find(
      (s: ApifySchedule) => s.name === SCHEDULE_NAME
    );

    // Get existing task
    const tasksResponse = await fetch(
      `${APIFY_API}/actor-tasks?token=${apiToken}`
    );
    const tasksData = await tasksResponse.json();
    let task = tasksData.data?.items?.find(
      (t: ApifyTask) => t.name === TASK_NAME
    );

    // If enabling and no task exists, create it
    if (enabled && !task) {
      console.log("Creating Apify task...");

      // Read venue URLs from data file or use defaults
      const defaultVenues = [
        { url: "https://www.facebook.com/mazebar.dalat" },
      ];

      const createTaskResponse = await fetch(
        `${APIFY_API}/actor-tasks?token=${apiToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actId: ACTOR_ID,
            name: TASK_NAME,
            input: {
              startUrls: defaultVenues,
              maxRequestsPerCrawl: 100,
            },
          }),
        }
      );

      if (!createTaskResponse.ok) {
        const err = await createTaskResponse.text();
        console.error("Failed to create task:", err);
        return NextResponse.json(
          { error: "Failed to create Apify task" },
          { status: 502 }
        );
      }

      const newTask = await createTaskResponse.json();
      task = newTask.data;
      console.log("Created task:", task.id);

      // Set up webhook if secret is configured
      if (webhookSecret) {
        await fetch(`${APIFY_API}/webhooks?token=${apiToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventTypes: ["ACTOR.RUN.SUCCEEDED"],
            requestUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://dalat.app"}/api/import/apify-webhook`,
            payloadTemplate: JSON.stringify({
              actorId: "{{actorId}}",
              actorRunId: "{{actorRunId}}",
              datasetId: "{{defaultDatasetId}}",
              eventType: "{{eventType}}",
            }),
            headersTemplate: JSON.stringify({
              Authorization: `Bearer ${webhookSecret}`,
              "Content-Type": "application/json",
            }),
          }),
        });
      }
    }

    if (existingSchedule) {
      // Update existing schedule
      const updateResponse = await fetch(
        `${APIFY_API}/schedules/${existingSchedule.id}?token=${apiToken}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isEnabled: enabled,
          }),
        }
      );

      if (!updateResponse.ok) {
        return NextResponse.json(
          { error: "Failed to update schedule" },
          { status: 502 }
        );
      }
    } else if (enabled && task) {
      // Create new schedule
      const createResponse = await fetch(
        `${APIFY_API}/schedules?token=${apiToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: SCHEDULE_NAME,
            cronExpression: "0 6 * * *", // Daily at 6 AM UTC
            isEnabled: true,
            actions: [
              {
                type: "RUN_ACTOR_TASK",
                actorTaskId: task.id,
              },
            ],
          }),
        }
      );

      if (!createResponse.ok) {
        const err = await createResponse.text();
        console.error("Failed to create schedule:", err);
        return NextResponse.json(
          { error: "Failed to create schedule" },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    console.error("Schedule update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
