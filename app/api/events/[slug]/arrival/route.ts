import { type NextRequest } from "next/server";
import { arrivalContext, guestCookieName, guestToken, newGuestToken, ownReceipt, staffGuestHash, tokenHash, mapOrder, orderColumns } from "@/lib/arrival/server";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { arrivalSchema } from "@/lib/arrival/schema";
import { visibleArrivalReceipt } from "@/lib/arrival/receipt";
import type { ArrivalReceipt } from "@/lib/arrival/types";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const { db, admin, user, event, access, menu } = await arrivalContext(slug, request.nextUrl.searchParams.get("locale") || "en");
    const token = await guestToken(event.id) || newGuestToken();
    const receipt = await ownReceipt(event.id, user?.id, tokenHash(token));
    let profile = null;
    let priorOrder = null;
    if (user) {
      const { data } = await db.from("profiles").select("display_name,username").eq("id", user.id).maybeSingle();
      profile = { name: data?.display_name || data?.username || "" };
      if (!receipt) {
        const result = await admin.from("event_preorders").select(orderColumns)
          .eq("event_id", event.id).eq("user_id", user.id).in("status", ["pending", "confirmed"]).maybeSingle();
        if (result.error) throw result.error;
        priorOrder = result.data ? mapOrder(result.data) : null;
      }
    }
    const response = arrivalJson({ event, access, menu, profile, receipt, priorOrder });
    response.cookies.set(guestCookieName(event.id), token, {
      httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "strict", path: "/", maxAge: 90 * 86400,
    });
    return response;
  } catch (error) { return arrivalFailure(error); }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  const parsed = arrivalSchema.safeParse(await readArrivalBody(request));
  if (!parsed.success) return arrivalJson({ code: "invalid_request" }, 400);
  try {
    const { slug } = await params;
    const { admin, user, event, access } = await arrivalContext(slug);
    const payload = parsed.data;
    if (payload.staffEntry && (!user || !access.canWelcome)) return arrivalJson({ code: "forbidden" }, 403);
    const token = await guestToken(event.id);
    if (!payload.staffEntry && !token) return arrivalJson({ code: "invalid_session" }, 400);
    const hash = payload.staffEntry ? staffGuestHash(payload.requestId) : tokenHash(token!);
    if (!payload.staffEntry) {
      // Vercel overwrites X-Forwarded-For. Other deployments share a conservative
      // bucket rather than trusting a client-supplied address or a fresh cookie.
      const ip = (process.env.VERCEL ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null) || "unknown";
      for (const [key, maximum] of [[`${event.id}:ip:${ip}`, 180], [`${event.id}:token:${hash}`, 30]] as const) {
        const limit = await admin.rpc("arrival_rate_limit", { p_key: tokenHash(key), p_limit: maximum });
        if (limit.error) throw limit.error;
        if (!limit.data) return arrivalJson({ code: "rate_limited" }, 429);
      }
    }
    // Signing in on the same phone must not create a second arrival for the
    // guest already holding this receipt. Account linking is a separate action.
    const guest = !payload.staffEntry ? await ownReceipt(event.id, undefined, hash) : null;
    const actorId = guest && !guest.participant.user_id ? null : user?.id || null;
    const { data, error } = await admin.rpc("arrival_submit", {
      p_event_id: event.id, p_actor_id: actorId, p_token_hash: hash,
      p_request_id: payload.requestId, p_payload: payload,
    });
    if (error) throw error;
    return arrivalJson(visibleArrivalReceipt(data as ArrivalReceipt, payload.staffEntry, access));
  } catch (error) { return arrivalFailure(error); }
}
