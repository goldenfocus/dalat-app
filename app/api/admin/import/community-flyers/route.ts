import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    { code: "legacy_submission_retired" },
    { status: 410 },
  );
}

export async function GET() {
  return retired();
}

export async function PATCH() {
  return retired();
}
