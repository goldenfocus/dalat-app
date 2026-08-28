import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      code: "legacy_event_import_retired",
      message:
        "Legacy scraping runs are retired; Activity Graph owns automatic discovery.",
    },
    { status: 410 },
  );
}
