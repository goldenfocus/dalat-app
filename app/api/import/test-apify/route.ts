import { NextResponse } from "next/server";

/**
 * Test endpoint to verify Apify API access
 */
export async function GET() {
  const apiToken = process.env.APIFY_API_TOKEN;

  if (!apiToken) {
    return NextResponse.json({
      error: "APIFY_API_TOKEN not set",
      configured: false,
    });
  }

  // Test 1: Check if token is valid by listing actors
  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts?token=${apiToken}&limit=1`
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: "Apify API token is invalid or doesn't have access",
        status: response.status,
        details: errorText.slice(0, 500),
        configured: true,
        tokenValid: false,
      });
    }

    const data = await response.json();

    // Test 2: Try multiple actors to see which ones are accessible
    const testActors = [
      "data-slayer/facebook-search-events",
      "pratikdani/facebook-event-scraper",
    ];

    const actorTests = [];
    for (const actorId of testActors) {
      const testRunResponse = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiToken}`,
        {
          method: "GET",
        }
      );

      actorTests.push({
        actorId,
        accessible: testRunResponse.ok,
        error: testRunResponse.ok ? null : await testRunResponse.text(),
      });
    }

    return NextResponse.json({
      success: true,
      configured: true,
      tokenValid: true,
      tokenPrefix: apiToken.substring(0, 10) + "...",
      actors: actorTests,
      message:
        actorTests.filter((a) => a.accessible).length > 0
          ? `✅ Apify configured correctly. ${actorTests.filter((a) => a.accessible).length}/${actorTests.length} actors accessible`
          : "⚠️ Token is valid but cannot access any tested actors",
    });
  } catch (error) {
    return NextResponse.json({
      error: "Failed to connect to Apify API",
      details: error instanceof Error ? error.message : "Unknown error",
      configured: true,
      tokenValid: false,
    });
  }
}
