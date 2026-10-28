import type { NextRequest } from "next/server";
import { arrivalContext, mapOrder } from "@/lib/arrival/server";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { reservationSchema } from "@/lib/arrival/schema";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  const parsed = reservationSchema.safeParse(await readArrivalBody(request));
  if (!parsed.success) return arrivalJson({ code: "invalid_request" }, 400);
  try {
    const { slug } = await params;
    const { admin, user, event } = await arrivalContext(slug);
    if (!user) return arrivalJson({ code: "not_authenticated" }, 401);
    const { data, error } = await admin.rpc("arrival_reserve", {
      p_event_id: event.id, p_actor_id: user.id, p_request_id: parsed.data.requestId, p_payload: parsed.data,
    });
    if (error) throw error;
    // The RPC already names its lines items, unlike a PostgREST relation result.
    const order = data.order as Record<string, unknown>;
    return arrivalJson({ order: mapOrder({ ...order, event_preorder_items: order.items }) });
  } catch (error) { return arrivalFailure(error); }
}
