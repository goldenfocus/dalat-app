import { createClient } from "@/lib/supabase/server";
import { noStoreJson } from "@/lib/http/no-store-json";
import { messageSchema, submissionSchema } from "@/lib/phuong/plan";
async function participant() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { db, user: null, role: null };
  const { data } = await db
    .from("phuong_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  return { db, user, role: data?.role as "phuong" | "zan" | undefined };
}
export async function GET() {
  const { db, user, role } = await participant();
  if (!user) return noStoreJson({ error: "login" }, { status: 401 });
  if (!role) return noStoreJson({ error: "participant" }, { status: 403 });
  const [plan, actions] = await Promise.all([
    db
      .from("phuong_plan")
      .select("content,version,updated_at")
      .eq("id", true)
      .single(),
    db
      .from("phuong_actions")
      .select("id,kind,author_id,content,created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  if (plan.error || actions.error)
    return noStoreJson({ error: "unavailable" }, { status: 503 });
  return noStoreJson({
    role,
    userId: user.id,
    plan: plan.data,
    actions: actions.data,
  });
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
  if (raw.length > 50000)
    return noStoreJson({ error: "size" }, { status: 413 });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return noStoreJson({ error: "invalid" }, { status: 400 });
  }
  const message = body?.action === "message";
  const parsed = message
    ? messageSchema.safeParse(body)
    : submissionSchema.safeParse(body);
  if (!parsed.success)
    return noStoreJson({ error: "invalid" }, { status: 400 });
  if (!message && role !== "phuong")
    return noStoreJson({ error: "readonly" }, { status: 403 });
  const data = parsed.data;
  const { data: version, error } = await db.rpc("submit_phuong_action", {
    p_id: data.requestId,
    p_kind: message ? "message" : "action" in data ? data.action : "",
    p_content: "message" in data ? { message: data.message } : data.plan,
    p_version: "expectedVersion" in data ? data.expectedVersion : 0,
  });
  if (error)
    return noStoreJson(
      { error: error.code === "40001" ? "conflict" : "save" },
      { status: error.code === "40001" ? 409 : 503 },
    );
  return noStoreJson({ version });
}
