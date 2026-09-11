import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Machine ingest routes (Scout / Review bots) authenticate with a Bearer
 * secret. Cookie sessions are intentionally ignored — a stolen moderator
 * cookie must not be enough to publish through these gates.
 *
 * Fail closed: a missing or empty env var is a configuration error (503),
 * not an open door.
 */
export function authorizeBearerSecret(
  request: Request,
  envName: "SCOUT_INGEST_KEY" | "REVIEW_INGEST_KEY",
) {
  const expected = process.env[envName]?.trim() ?? "";
  if (!expected) {
    console.error(`[import/bearer] ${envName} is not configured`);
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Ingest is not configured" },
        { status: 503 },
      ),
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  const provided = match?.[1] ?? "";
  if (!provided || !secretsEqual(provided, expected)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true as const };
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
