import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPeopleEnabled } from "./constants";

export function peopleJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Always use the actual session, never staff impersonation or a service key. */
export async function peopleSession(request: Request) {
  if (!isPeopleEnabled()) return { response: peopleJson({ code: "unavailable" }, 404) };
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return { response: peopleJson({ code: "forbidden" }, 403) };
  }
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { response: peopleJson({ code: "unauthorized" }, 401) };
  return { db, user };
}

export async function readPeopleBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return null;
  // A bounded payload also protects endpoints from accidental giant form posts.
  if (Number(request.headers.get("content-length")) > 12000) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12000) { await reader.cancel(); return null; }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
