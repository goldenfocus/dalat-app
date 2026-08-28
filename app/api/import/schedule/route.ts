import { NextResponse } from "next/server";

const retired = () =>
  NextResponse.json(
    {
      code: "legacy_event_import_retired",
      message:
        "Legacy scraping schedules are retired; Activity Graph owns automatic discovery.",
    },
    { status: 410 },
  );

export async function GET() {
  return retired();
}

export async function POST() {
  return retired();
}
