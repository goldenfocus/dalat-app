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

    const _data = await response.json();

    // Test 2: List all actors available to this account
    const actorsResponse = await fetch(
      `https://api.apify.com/v2/acts?token=${apiToken}&limit=100`
    );

    if (!actorsResponse.ok) {
      return NextResponse.json({
        error: "Cannot list actors",
        details: await actorsResponse.text(),
      });
    }

    const actorsData = await actorsResponse.json();
    const availableActors = actorsData.data?.items || [];

    // Filter for Facebook/event related actors
    const relevantActors = availableActors.filter((actor: Record<string, unknown>) => {
      const name = (actor.name || "").toLowerCase();
      const title = (actor.title || "").toLowerCase();
      return (
        name.includes("facebook") ||
        name.includes("event") ||
        title.includes("facebook") ||
        title.includes("event")
      );
    });

    return NextResponse.json({
      success: true,
      configured: true,
      tokenValid: true,
      tokenPrefix: apiToken.substring(0, 10) + "...",
      totalActorsAvailable: availableActors.length,
      relevantActors: relevantActors.map((a: Record<string, unknown>) => ({
        id: a.id,
        name: a.name,
        title: a.title,
        username: a.username,
      })),
      allActors: availableActors.slice(0, 10).map((a: Record<string, unknown>) => ({
        id: a.id,
        name: a.name,
        title: a.title,
        username: a.username,
      })),
      message:
        relevantActors.length > 0
          ? `✅ Found ${relevantActors.length} Facebook/event actors available`
          : `⚠️ No Facebook/event actors found. ${availableActors.length} total actors available.`,
    });
  } catch (error) {
    console.error("Apify test error:", error);
    return NextResponse.json({
      error: "Failed to connect to Apify API",
      configured: true,
      tokenValid: false,
    });
  }
}
