import { NextResponse } from "next/server";

/**
 * Retired: the former government-article pipeline produced draft events that
 * depended on human review. First-party sources now enter through Activity
 * Graph, where deterministic gates either publish automatically or withhold.
 */
export async function GET() {
  return NextResponse.json(
    {
      code: "legacy_event_import_retired",
      message: "Automatic event discovery now runs through the Activity Graph.",
    },
    { status: 410 },
  );
}
