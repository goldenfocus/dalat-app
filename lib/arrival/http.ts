import { NextResponse } from "next/server";
export { readPeopleBody as readArrivalBody } from "@/lib/people/http";

export function arrivalJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0",
    "Vary": "Cookie",
    "X-Robots-Tag": "noindex, nofollow",
  } });
}

export function arrivalMutationAllowed(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export function arrivalFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "unavailable");
  const code = message.match(/\b(forbidden|not_authenticated|event_not_found|event_not_open_for_arrival|event_not_open_for_preorder|preorder_disabled|sponsor_limit_reached|sponsor_already_used|arrival_required|item_unavailable|existing_order|request_conflict|status_conflict|invalid_[a-z_]+|rsvp_not_found|participant_not_found|order_not_found|profile_not_found|user_not_found)\b/)?.[1] || ((error as { code?: string })?.code === "23505" ? "status_conflict" : "unavailable");
  const status = code === "forbidden" ? 403 : code === "not_authenticated" ? 401
    : code === "event_not_found" ? 404 : ["existing_order", "request_conflict", "status_conflict"].includes(code) ? 409
      : code === "unavailable" ? 503 : 400;
  return arrivalJson({ code, error: code }, status);
}
