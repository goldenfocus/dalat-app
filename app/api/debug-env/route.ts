import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasReplicateToken: !!process.env.REPLICATE_API_TOKEN,
    tokenLength: process.env.REPLICATE_API_TOKEN?.length || 0,
    tokenPrefix: process.env.REPLICATE_API_TOKEN?.slice(0, 5) || "none",
    nodeEnv: process.env.NODE_ENV,
  });
}
