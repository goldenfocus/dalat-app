import type { NextRequest } from "next/server";
import { z } from "zod";
import { arrivalContext } from "@/lib/arrival/server";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
const schema = z.object({ limit: z.number().int().min(0).max(100000), itemIds: z.array(z.string().uuid()).max(100).optional() }).strict();
export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  const parsed = schema.safeParse(await readArrivalBody(request));
  if (!parsed.success) return arrivalJson({ code: "invalid_request" }, 400);
  try {
    const { slug } = await params;
    const { admin, user, event, access } = await arrivalContext(slug);
    if (!user || !access.canManage) return arrivalJson({ code: "forbidden" }, 403);
    const { error } = await admin.rpc(parsed.data.itemIds ? "set_event_drink_offer" : "set_event_drink_limit", { p_event_id: event.id, p_actor_id: user.id, p_limit: parsed.data.limit, ...(parsed.data.itemIds ? { p_item_ids: parsed.data.itemIds } : {}) });
    if (error) throw error;
    return arrivalJson({ limit: parsed.data.limit });
  } catch (error) { return arrivalFailure(error); }
}
