#!/usr/bin/env bun
/**
 * Set up automated daily scraping of Đà Lạt venues via Apify
 *
 * This script:
 * 1. Creates or updates an Apify Task with venue Facebook URLs
 * 2. Configures a webhook to our import endpoint
 * 3. Sets up a daily schedule
 *
 * Usage: bun run scripts/setup-apify-schedule.ts
 *
 * Requires:
 *   - APIFY_API_TOKEN in environment
 *   - APIFY_WEBHOOK_SECRET in environment
 *   - data/dalat-venue-urls.json with Facebook URLs
 */

const APIFY_API = "https://api.apify.com/v2";
const ACTOR_ID = "pratikdani/facebook-event-scraper";
const TASK_NAME = "dalat-venue-events-daily";
const WEBHOOK_URL = "https://dalat.app/api/import/apify-webhook";

interface VenueData {
  venues: Array<{
    name: string;
    facebookUrl: string | null;
  }>;
}

async function main() {
  console.log("======================================================");
  console.log("       Apify Automated Scraping Setup");
  console.log("======================================================\n");

  // Check environment
  const apiToken = process.env.APIFY_API_TOKEN;
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;

  if (!apiToken) {
    console.error("Missing APIFY_API_TOKEN environment variable");
    process.exit(1);
  }

  if (!webhookSecret) {
    console.error("Missing APIFY_WEBHOOK_SECRET environment variable");
    process.exit(1);
  }

  // Load venue URLs
  const venueFile = Bun.file("./data/dalat-venue-urls.json");
  if (!(await venueFile.exists())) {
    console.error("Missing ./data/dalat-venue-urls.json");
    console.log("Run the venue discovery script first or create manually.");
    process.exit(1);
  }

  const venueData: VenueData = await venueFile.json();
  const facebookUrls = venueData.venues
    .filter((v) => v.facebookUrl)
    .map((v) => ({ url: v.facebookUrl }));

  if (facebookUrls.length === 0) {
    console.error("No Facebook URLs found in venue data");
    console.log("Add Facebook URLs to ./data/dalat-venue-urls.json first.");
    process.exit(1);
  }

  console.log(`Found ${facebookUrls.length} Facebook URLs to scrape\n`);

  // Step 1: Check if task already exists
  console.log("Step 1: Checking for existing task...");

  const tasksResponse = await fetch(
    `${APIFY_API}/actor-tasks?token=${apiToken}`
  );
  const tasks = await tasksResponse.json();

  let taskId: string | null = null;
  const existingTask = tasks.data?.items?.find(
    (t: { name: string }) => t.name === TASK_NAME
  );

  if (existingTask) {
    taskId = existingTask.id;
    console.log(`  Found existing task: ${taskId}\n`);
  } else {
    console.log("  No existing task, will create new one\n");
  }

  // Step 2: Create or update the task
  console.log("Step 2: Configuring task...");

  const taskInput = {
    startUrls: facebookUrls,
    maxRequestsPerCrawl: 100,
    proxyConfiguration: {
      useApifyProxy: true,
    },
  };

  if (taskId) {
    // Update existing task
    const updateResponse = await fetch(
      `${APIFY_API}/actor-tasks/${taskId}?token=${apiToken}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: taskInput,
        }),
      }
    );

    if (!updateResponse.ok) {
      console.error("  Failed to update task:", await updateResponse.text());
      process.exit(1);
    }
    console.log("  Task updated successfully\n");
  } else {
    // Create new task
    const createResponse = await fetch(
      `${APIFY_API}/actor-tasks?token=${apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actId: ACTOR_ID.replace("~", "/"),
          name: TASK_NAME,
          input: taskInput,
        }),
      }
    );

    if (!createResponse.ok) {
      console.error("  Failed to create task:", await createResponse.text());
      process.exit(1);
    }

    const newTask = await createResponse.json();
    taskId = newTask.data.id;
    console.log(`  Task created: ${taskId}\n`);
  }

  // Step 3: Configure webhook
  console.log("Step 3: Configuring webhook...");

  const webhooksResponse = await fetch(
    `${APIFY_API}/webhooks?token=${apiToken}`
  );
  const webhooks = await webhooksResponse.json();

  const existingWebhook = webhooks.data?.items?.find(
    (w: { requestUrl: string; eventTypes: string[] }) =>
      w.requestUrl === WEBHOOK_URL &&
      w.eventTypes.includes("ACTOR.RUN.SUCCEEDED")
  );

  if (existingWebhook) {
    console.log("  Webhook already configured\n");
  } else {
    const webhookResponse = await fetch(
      `${APIFY_API}/webhooks?token=${apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypes: ["ACTOR.RUN.SUCCEEDED"],
          requestUrl: WEBHOOK_URL,
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
      }
    );

    if (!webhookResponse.ok) {
      console.error(
        "  Failed to create webhook:",
        await webhookResponse.text()
      );
      console.log("  You may need to configure the webhook manually.\n");
    } else {
      console.log("  Webhook created successfully\n");
    }
  }

  // Step 4: Configure schedule
  console.log("Step 4: Configuring daily schedule...");

  const schedulesResponse = await fetch(
    `${APIFY_API}/schedules?token=${apiToken}`
  );
  const schedules = await schedulesResponse.json();

  const existingSchedule = schedules.data?.items?.find(
    (s: { name: string }) => s.name === `${TASK_NAME}-schedule`
  );

  if (existingSchedule) {
    console.log("  Schedule already exists\n");
  } else {
    const scheduleResponse = await fetch(
      `${APIFY_API}/schedules?token=${apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${TASK_NAME}-schedule`,
          cronExpression: "0 6 * * *", // Daily at 6:00 AM UTC
          isEnabled: true,
          actions: [
            {
              type: "RUN_ACTOR_TASK",
              actorTaskId: taskId,
            },
          ],
        }),
      }
    );

    if (!scheduleResponse.ok) {
      console.error(
        "  Failed to create schedule:",
        await scheduleResponse.text()
      );
      console.log("  You may need to configure the schedule manually.\n");
    } else {
      console.log("  Daily schedule created (6:00 AM UTC)\n");
    }
  }

  console.log("======================================================");
  console.log("                 Setup Complete!");
  console.log("======================================================\n");
  console.log("Configuration summary:");
  console.log(`  - Task ID: ${taskId}`);
  console.log(`  - Actor: ${ACTOR_ID}`);
  console.log(`  - URLs to scrape: ${facebookUrls.length}`);
  console.log(`  - Webhook: ${WEBHOOK_URL}`);
  console.log("  - Schedule: Daily at 6:00 AM UTC\n");
  console.log("To run the task manually:");
  console.log(`  curl -X POST "${APIFY_API}/actor-tasks/${taskId}/runs?token=YOUR_TOKEN"\n`);
  console.log("Or visit the Apify Console:");
  console.log(`  https://console.apify.com/actor-tasks/${taskId}`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
