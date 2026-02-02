import { NextResponse } from "next/server";

export async function GET() {
  // List all env var keys to see what's available
  const allEnvKeys = Object.keys(process.env);
  const replicateKeys = allEnvKeys.filter(k =>
    k.toUpperCase().includes("REPLICATE") || k.toUpperCase().includes("TOKEN")
  );

  const token = process.env.REPLICATE_API_TOKEN;

  return NextResponse.json({
    hasReplicateToken: !!token,
    tokenLength: token?.length || 0,
    tokenPrefix: token?.slice(0, 5) || "none",
    tokenType: typeof token,
    nodeEnv: process.env.NODE_ENV,
    replicateRelatedKeys: replicateKeys,
    totalEnvKeys: allEnvKeys.length,
    // Check if it might be an empty string or whitespace
    isEmptyString: token === "",
    isWhitespace: token?.trim() === "",
  });
}
