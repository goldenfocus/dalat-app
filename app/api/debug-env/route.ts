import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;

  return NextResponse.json({
    hasReplicateToken: !!token,
    tokenLength: token?.length || 0,
    tokenPrefix: token?.slice(0, 5) || "none",
    nodeEnv: process.env.NODE_ENV,
  });
}
