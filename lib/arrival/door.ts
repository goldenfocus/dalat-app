import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The door key appears only in the QR and link shown to welcome staff. Scanning it
 * shows the guest is physically at the venue; opening the public arrival link from
 * elsewhere does not. It grants no staff access and nothing beyond confirming presence.
 */
export function doorKey(eventId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("unavailable");
  return createHmac("sha256", secret).update(`door:${eventId}`).digest("hex").slice(0, 20);
}

export function validDoorKey(eventId: string, key: unknown): boolean {
  if (typeof key !== "string" || !/^[a-f0-9]{20}$/.test(key)) return false;
  try {
    return timingSafeEqual(Buffer.from(doorKey(eventId)), Buffer.from(key));
  } catch { return false; }
}
