import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export function datingJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
export async function datingSession(request: Request) {
  const origin = request.headers.get("origin");
  if (
    request.method !== "GET" &&
    (!origin || origin !== new URL(request.url).origin)
  )
    return { response: datingJson({ code: "forbidden" }, 403) };
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    return { response: datingJson({ code: "unauthorized" }, 401) };
  return { db, user };
}
export function datingFailure(error: { message: string }) {
  const code =
    [
      "rate_limited",
      "adult_only",
      "birth_date_required",
      "account_not_ready",
      "unavailable",
      "unauthorized",
    ].find((c) => error.message === c) ?? "invalid_request";
  return datingJson(
    { code },
    code === "rate_limited"
      ? 429
      : code === "unauthorized"
        ? 401
        : code === "unavailable"
          ? 404
          : 400,
  );
}
