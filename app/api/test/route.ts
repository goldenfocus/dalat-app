import { NextResponse } from "next/server";

/**
 * GET /api/test
 * Legacy test endpoint
 * Migrated from pages/api/test.js
 */
export async function GET() {
  return NextResponse.json({
    message: "Tony Miller Exhibition API is LIVE!",
    timestamp: new Date().toISOString(),
    legacy: true,
  });
}
