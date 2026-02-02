import { NextResponse } from "next/server";

// Fresh endpoint to test if env vars are injected into newly created functions
export async function GET() {
  // Direct access to specific env vars
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const openaiKey = process.env.OPENAI_API_KEY;

  // Also check total available env vars
  const totalEnvKeys = Object.keys(process.env).length;

  return NextResponse.json({
    hasReplicateToken: !!replicateToken,
    replicateTokenPrefix: replicateToken?.slice(0, 8) || "none",
    hasCloudflareAccountId: !!cloudflareAccountId,
    cloudflareAccountIdPrefix: cloudflareAccountId?.slice(0, 8) || "none",
    hasOpenaiKey: !!openaiKey,
    openaiKeyPrefix: openaiKey?.slice(0, 12) || "none",
    totalEnvKeys,
    timestamp: new Date().toISOString(),
  });
}
