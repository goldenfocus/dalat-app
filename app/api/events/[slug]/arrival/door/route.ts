import { type NextRequest } from "next/server";
import { z } from "zod";
import { arrivalContext, guestToken, ownReceipt, tokenHash } from "@/lib/arrival/server";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { validDoorKey } from "@/lib/arrival/door";
import { confirmArrival } from "@/lib/practice/server";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ slug: string }> };
const schema = z.object({ doorKey: z.string().min(1).max(64) }).strict();

/**
 * Someone who checked in earlier from elsewhere scans the door QR at the venue.
 * Confirms only the caller's own existing arrival; creates nothing and grants no access.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  const parsed = schema.safeParse(await readArrivalBody(request));
  if (!parsed.success) return arrivalJson({ code: "invalid_request" }, 400);
  try {
    const { slug } = await params;
    const { user, event } = await arrivalContext(slug);
    if (!event.isOpen) return arrivalJson({ code: "event_not_open_for_arrival" }, 400);
    if (!validDoorKey(event.id, parsed.data.doorKey)) return arrivalJson({ code: "forbidden" }, 403);
    const token = await guestToken(event.id);
    const receipt = await ownReceipt(event.id, user?.id, token ? tokenHash(token) : null);
    if (!receipt) return arrivalJson({ code: "participant_not_found" }, 404);
    await confirmArrival(slug, receipt.participant.id);
    return arrivalJson({ ok: true });
  } catch (error) { return arrivalFailure(error); }
}
