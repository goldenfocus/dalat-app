import { createClient } from "@/lib/supabase/server";
import { noStoreJson } from "@/lib/http/no-store-json";
import { voteSchema } from "@/lib/phuong/ideas";
async function participant() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const member = user
    ? await db
        .from("phuong_members")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle()
    : null;
  return { db, user, role: member?.data?.role };
}
export async function GET() {
  const { db, user, role } = await participant();
  if (!user) return noStoreJson({ error: "login" }, { status: 401 });
  if (!role) return noStoreJson({ error: "participant" }, { status: 403 });
  const { data, error } = await db
    .from("phuong_idea_votes")
    .select("user_id,idea_id,rating");
  if (error) return noStoreJson({ error: "unavailable" }, { status: 503 });
  return noStoreJson({ votes: data, userId: user.id });
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return noStoreJson({ error: "origin" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return noStoreJson({ error: "format" }, { status: 415 });
  const { db, user, role } = await participant();
  if (!user) return noStoreJson({ error: "login" }, { status: 401 });
  if (!role) return noStoreJson({ error: "participant" }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 1000) return noStoreJson({ error: "size" }, { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return noStoreJson({ error: "invalid" }, { status: 400 });
  }
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success)
    return noStoreJson({ error: "invalid" }, { status: 400 });
  const { error } = await db
    .from("phuong_idea_votes")
    .upsert(
      {
        user_id: user.id,
        idea_id: parsed.data.ideaId,
        rating: parsed.data.rating,
      },
      { onConflict: "user_id,idea_id" },
    );
  if (error) return noStoreJson({ error: "save" }, { status: 503 });
  return noStoreJson({ saved: true });
}
