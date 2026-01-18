import { NextResponse } from "next/server";
import { processApifyPayload } from "@/lib/import/apify-processor";
import type { ApifyWebhookPayload } from "@/lib/import/types";

/**
 * Apify webhook endpoint
 *
 * Receives POST requests from Apify when scraping completes.
 * Fetches the dataset and processes events based on the actor type.
 */
export async function POST(request: Request) {
  try {
    // Verify webhook secret
    const authHeader = request.headers.get("authorization");
    const expectedSecret = process.env.APIFY_WEBHOOK_SECRET;

    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      console.error("Apify webhook: Invalid authorization header");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload: ApifyWebhookPayload = await request.json();
    const { actorId, actorRunId, datasetId, eventType } = payload;

    // Only process successful runs
    if (eventType !== "ACTOR.RUN.SUCCEEDED") {
      return NextResponse.json({
        message: `Ignored event type: ${eventType}`,
      });
    }

    // Validate required fields
    if (!datasetId) {
      return NextResponse.json(
        { error: "Missing datasetId in payload" },
        { status: 400 }
      );
    }

    // Fetch results from Apify dataset
    const apiToken = process.env.APIFY_API_TOKEN;
    if (!apiToken) {
      console.error("Apify webhook: Missing APIFY_API_TOKEN");
      return NextResponse.json(
        { error: "Apify integration not configured" },
        { status: 503 }
      );
    }

    const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiToken}`;
    const datasetResponse = await fetch(datasetUrl);

    if (!datasetResponse.ok) {
      console.error(
        `Apify webhook: Failed to fetch dataset: ${datasetResponse.status} ${datasetResponse.statusText}`
      );
      return NextResponse.json(
        { error: `Failed to fetch dataset: ${datasetResponse.statusText}` },
        { status: 502 }
      );
    }

    const items = await datasetResponse.json();

    console.log(
      `Apify webhook: Processing ${items.length} items from actor ${actorId}, run ${actorRunId}`
    );

    // Process based on actor type
    const result = await processApifyPayload({
      actorId,
      actorRunId,
      items,
    });

    console.log(
      `Apify webhook: Processed ${result.processed}, skipped ${result.skipped}, errors ${result.errors}`
    );

    return NextResponse.json({
      success: true,
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (error) {
    console.error("Apify webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
