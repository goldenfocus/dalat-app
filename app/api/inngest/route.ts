import { NextResponse } from "next/server";

/**
 * dalat.app no longer runs Inngest functions, but an old Inngest app still
 * POSTs here every few seconds. Without this route the request fell through to
 * app/[locale]/[slug] (locale "api", slug "inngest") and ran profile, venue,
 * and organizer lookups against Supabase for a fake slug — thousands of failed
 * queries a day. Answer immediately, without touching the database.
 */
function gone() {
  return NextResponse.json(
    { error: "Inngest is not used by dalat.app" },
    { status: 410, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}

export const GET = gone;
export const POST = gone;
export const PUT = gone;
