import { createClient } from "@/lib/supabase/server";
import { noStoreJson } from "@/lib/http/no-store-json";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return noStoreJson({ error: "unauthorized" }, { status: 401 });
  const [{ data: profile }, { data: answers, error }] = await Promise.all([
    supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle(),
    supabase.from("workshop_answers").select("question_id, content, updated_at").eq("author_id", user.id),
  ]);
  if (error) return noStoreJson({ error: "unavailable" }, { status: 503 });
  return noStoreJson({ author: { id: user.id, name: profile?.display_name || profile?.username || "Dalat.app", username: profile?.username || null }, answers });
}

export async function POST(request: Request) {
  // Reject cross-site form submissions; identity always comes from the session.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return noStoreJson({ error: "origin" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return noStoreJson({ error: "format" }, { status: 415 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return noStoreJson({ error: "unauthorized" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 40000) return noStoreJson({ error: "too_large" }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return noStoreJson({ error: "invalid" }, { status: 400 }); }
  if (!body || !Number.isInteger(body.question_id) || body.question_id < 1 || body.question_id > 6 || typeof body.content !== "string" || body.content.length > 6000) {
    return noStoreJson({ error: "invalid" }, { status: 400 });
  }
  if (body.expected_author_id !== user.id) return noStoreJson({ error: "account_changed" }, { status: 409 });
  const { data, error } = await supabase.from("workshop_answers").upsert({
    author_id: user.id, question_id: body.question_id, content: body.content,
    updated_at: new Date().toISOString(),
  }, { onConflict: "author_id,question_id" }).select("question_id, content, updated_at").single();
  if (error) return noStoreJson({ error: "unavailable" }, { status: 503 });
  return noStoreJson({ answer: data });
}
