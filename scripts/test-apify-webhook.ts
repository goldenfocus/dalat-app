#!/usr/bin/env bun
/**
 * Test the Apify webhook processor locally
 *
 * Usage: bun run scripts/test-apify-webhook.ts [--dry-run]
 */

import { processApifyPayload } from "../lib/import/apify-processor";

const isDryRun = process.argv.includes("--dry-run");

// Mock Facebook events for testing
const mockFacebookEvents = [
  {
    url: "https://www.facebook.com/events/test-123456789/",
    name: "Test Concert in Da Lat",
    description:
      "A wonderful test concert featuring local artists. Join us for an evening of music under the stars!",
    startDate: "2026-02-15T19:00:00.000Z",
    endDate: "2026-02-15T23:00:00.000Z",
    location: {
      name: "Phố Bên Đồi",
      city: "Da Lat, Vietnam",
      latitude: 11.9404,
      longitude: 108.4583,
    },
    coverPhoto: "https://example.com/concert-image.jpg",
    organizer: {
      name: "Test Music Collective",
    },
    goingCount: 50,
    interestedCount: 200,
  },
  {
    url: "https://www.facebook.com/events/test-987654321/",
    name: "Art Workshop: Watercolor Painting",
    description:
      "Learn watercolor painting techniques with local artists. All materials provided.",
    startDate: "2026-02-20T14:00:00.000Z",
    location: {
      name: "Dalat Art Space",
      address: "123 Phan Dinh Phung, Da Lat",
    },
    coverPhoto: "https://example.com/art-workshop.jpg",
    organizedBy: "Event by Dalat Creative Hub",
    goingCount: 15,
    interestedCount: 45,
  },
];

// Mock Instagram posts for testing
const mockInstagramPosts = [
  {
    url: "https://www.instagram.com/p/test123/",
    caption: `🎉 SAVE THE DATE! 🎉

We're hosting a NIGHT MARKET at Dalat Night Square on February 22nd, 2026!

📍 Location: Dalat Night Square
🕖 Time: 6PM - 11PM
🎫 Free entry

Local artisans, food vendors, live music, and more! Tag your friends and come celebrate with us!

#dalat #nightmarket #dalatevents #vietnamevents`,
    displayUrl: "https://example.com/night-market.jpg",
    ownerUsername: "dalat_events",
    locationName: "Da Lat Night Square",
    likesCount: 234,
    hashtags: ["dalat", "nightmarket", "dalatevents", "vietnamevents"],
  },
];

async function test() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║     Apify Webhook Processor Test Suite     ║");
  console.log("╚════════════════════════════════════════════╝\n");

  if (isDryRun) {
    console.log("🔍 DRY RUN MODE - No database changes will be made\n");
  }

  // Test Facebook processor
  console.log("━━━ Test 1: Facebook Events Processor ━━━\n");
  console.log(`Testing with ${mockFacebookEvents.length} mock events...`);

  if (!isDryRun) {
    const fbResult = await processApifyPayload({
      actorId: "pratikdani/facebook-event-scraper",
      actorRunId: "test-run-fb-001",
      items: mockFacebookEvents,
    });

    console.log("\nResult:");
    console.log(`  ✅ Processed: ${fbResult.processed}`);
    console.log(`  ⏭️  Skipped: ${fbResult.skipped}`);
    console.log(`  ❌ Errors: ${fbResult.errors}`);
    if (fbResult.details.length > 0) {
      console.log("\nDetails:");
      fbResult.details.forEach((d) => console.log(`    ${d}`));
    }
  } else {
    console.log("  Would process 2 Facebook events");
  }

  // Test Instagram processor
  console.log("\n━━━ Test 2: Instagram Posts Processor ━━━\n");
  console.log(`Testing with ${mockInstagramPosts.length} mock posts...`);
  console.log("(Note: This uses Claude Haiku for AI extraction)\n");

  if (!isDryRun) {
    const igResult = await processApifyPayload({
      actorId: "apify/instagram-hashtag-scraper",
      actorRunId: "test-run-ig-001",
      items: mockInstagramPosts,
    });

    console.log("Result:");
    console.log(`  ✅ Processed: ${igResult.processed}`);
    console.log(`  ⏭️  Skipped: ${igResult.skipped}`);
    console.log(`  ❌ Errors: ${igResult.errors}`);
    if (igResult.details.length > 0) {
      console.log("\nDetails:");
      igResult.details.forEach((d) => console.log(`    ${d}`));
    }
  } else {
    console.log("  Would analyze 1 Instagram post with AI and extract event data");
  }

  // Test platform detection
  console.log("\n━━━ Test 3: Platform Auto-Detection ━━━\n");

  const testUrls = [
    { url: "https://facebook.com/events/123", expected: "facebook" },
    { url: "https://instagram.com/p/abc", expected: "instagram" },
    { url: "https://tiktok.com/@user/video/123", expected: "tiktok" },
    { url: "https://eventbrite.com/e/123", expected: "eventbrite" },
    { url: "https://lu.ma/abc123", expected: "eventbrite" },
    { url: "https://meetup.com/group/event", expected: "eventbrite" },
  ];

  console.log("URL detection (from unknown actor):");
  testUrls.forEach((t) => {
    console.log(`  ${t.url} → ${t.expected}`);
  });

  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║            Test Suite Complete             ║");
  console.log("╚════════════════════════════════════════════╝\n");

  if (!isDryRun) {
    console.log("✨ Run with --dry-run to preview without database changes");
  }
}

test().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
