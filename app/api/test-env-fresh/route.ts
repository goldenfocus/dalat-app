import { NextResponse } from "next/server";

// Fresh endpoint to test if env vars are injected into newly created functions
export async function GET() {
  const token = process.env.REPLICATE_API_TOKEN;
  const allKeys = Object.keys(process.env).filter(k =>
    k.includes("REPLICATE") || k.includes("CLOUDFLARE") || k.includes("OPENAI")
  );

  return NextResponse.json({
    hasReplicateToken: !!token,
    tokenPrefix: token?.slice(0, 8) || "none",
    envKeysWithReplicateOrCloudflareOrOpenai: allKeys,
    timestamp: new Date().toISOString(),
  });
}
