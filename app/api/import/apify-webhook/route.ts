import { NextResponse } from "next/server";

/**
 * The legacy Apify event webhook is intentionally retired. Machine-discovered
 * activities may publish only through Activity Graph evidence and freshness
 * gates; this endpoint must never create review drafts or bypass those gates.
 */
export async function POST() {
  return NextResponse.json(
    {
      code: "legacy_event_import_retired",
      message: "Automatic event discovery now runs through the Activity Graph.",
    },
    { status: 410 },
  );
}
