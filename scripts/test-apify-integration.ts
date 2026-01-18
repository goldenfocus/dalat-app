#!/usr/bin/env bun
/**
 * Full integration test - calls the actual webhook endpoint
 *
 * Usage:
 *   bun run scripts/test-apify-integration.ts [--local]
 *
 * Options:
 *   --local    Test against localhost:3000 (default)
 *   --prod     Test against production (dalat.app)
 */

const isLocal = !process.argv.includes("--prod");
const WEBHOOK_URL = isLocal
  ? "http://localhost:3000/api/import/apify-webhook"
  : "https://dalat.app/api/import/apify-webhook";

const WEBHOOK_SECRET = process.env.APIFY_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error("❌ Missing APIFY_WEBHOOK_SECRET environment variable");
  console.log("\nSet it with:");
  console.log("  export APIFY_WEBHOOK_SECRET=your_secret_here\n");
  process.exit(1);
}

async function testWebhook() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║       Apify Webhook Integration Test       ║");
  console.log("╚════════════════════════════════════════════╝\n");

  console.log(`Target: ${WEBHOOK_URL}\n`);

  // Test 1: Invalid auth
  console.log("━━━ Test 1: Invalid Authorization ━━━\n");
  const invalidAuthResponse = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalid_secret",
    },
    body: JSON.stringify({
      actorId: "test/actor",
      eventType: "ACTOR.RUN.SUCCEEDED",
      datasetId: "test",
    }),
  });
  console.log(`Status: ${invalidAuthResponse.status}`);
  console.log(`Expected: 401`);
  console.log(
    invalidAuthResponse.status === 401 ? "✅ PASSED\n" : "❌ FAILED\n"
  );

  // Test 2: Ignored event type
  console.log("━━━ Test 2: Ignored Event Type ━━━\n");
  const ignoredEventResponse = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({
      actorId: "test/actor",
      actorRunId: "test-run",
      datasetId: "test",
      eventType: "ACTOR.RUN.FAILED",
    }),
  });
  console.log(`Status: ${ignoredEventResponse.status}`);
  const ignoredBody = await ignoredEventResponse.json();
  console.log(`Response: ${JSON.stringify(ignoredBody)}`);
  console.log(
    ignoredBody.message?.includes("Ignored") ? "✅ PASSED\n" : "❌ FAILED\n"
  );

  // Test 3: Missing datasetId
  console.log("━━━ Test 3: Missing Dataset ID ━━━\n");
  const missingDatasetResponse = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({
      actorId: "test/actor",
      eventType: "ACTOR.RUN.SUCCEEDED",
    }),
  });
  console.log(`Status: ${missingDatasetResponse.status}`);
  console.log(`Expected: 400`);
  console.log(
    missingDatasetResponse.status === 400 ? "✅ PASSED\n" : "❌ FAILED\n"
  );

  // Test 4: Valid request structure (will fail dataset fetch but tests routing)
  console.log("━━━ Test 4: Valid Request Structure ━━━\n");
  const validStructureResponse = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({
      actorId: "pratikdani/facebook-event-scraper",
      actorRunId: "integration-test-001",
      datasetId: "fake-dataset-id",
      eventType: "ACTOR.RUN.SUCCEEDED",
    }),
  });
  console.log(`Status: ${validStructureResponse.status}`);
  const validBody = await validStructureResponse.json();
  console.log(`Response: ${JSON.stringify(validBody)}`);
  // This will return 502 because the fake dataset doesn't exist
  console.log(
    validStructureResponse.status === 502
      ? "✅ PASSED (expected 502 for fake dataset)\n"
      : "ℹ️  Got different status - check response\n"
  );

  console.log("╔════════════════════════════════════════════╗");
  console.log("║          Integration Test Complete         ║");
  console.log("╚════════════════════════════════════════════╝\n");

  console.log("Next steps:");
  console.log("  1. Configure a real Apify actor");
  console.log("  2. Set up webhook in Apify console pointing to your endpoint");
  console.log("  3. Run the actor and watch for events in your database\n");
}

testWebhook().catch((err) => {
  console.error("Integration test failed:", err);
  process.exit(1);
});
