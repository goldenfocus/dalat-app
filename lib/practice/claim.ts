import { createHmac, timingSafeEqual } from "node:crypto";

export const claimCookieName = (eventId: string) => `dalat_practice_${eventId.replaceAll("-", "")}`;

/** A recovered receipt can reveal one group, never staff controls or the full roster. */
export function signClaim(eventId: string, personId: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ eventId, personId, expires: now + 6 * 3600_000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyClaim(token: string, eventId: string, secret: string, now = Date.now()): string | null {
  if (token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const supplied = Buffer.from(parts[1], "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const body = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Record<string, unknown>;
    return body.eventId === eventId && typeof body.expires === "number" && body.expires > now && typeof body.personId === "string" ? body.personId : null;
  } catch { return null; }
}
