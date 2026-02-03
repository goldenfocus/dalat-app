import { NextResponse } from "next/server";
import { headers } from "next/headers";

// Force dynamic rendering to ensure env vars are available at runtime
export const dynamic = "force-dynamic";

export async function GET() {
  // Force dynamic evaluation
  await headers();

  const token = process.env.REPLICATE_API_TOKEN;

  return NextResponse.json({
    hasReplicateToken: !!token,
    tokenLength: token?.length || 0,
    tokenPrefix: token?.slice(0, 5) || "none",
    nodeEnv: process.env.NODE_ENV,
  });
}
