import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * The legacy suggestion lane required a person to approve extracted details.
 * Activity discovery is now automatic and policy-gated, so accepting work into
 * that queue would be misleading. Keep the endpoint explicit and side-effect
 * free for old clients and cached forms.
 */
export async function POST(_request: Request) {
  return NextResponse.json(
    {
      code: "suggestions_retired",
      message: "Activity discovery is automatic; there is no approval queue.",
    },
    { status: 410 },
  );
}
