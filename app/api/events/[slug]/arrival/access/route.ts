import { createClient } from "@/lib/supabase/server";
import { arrivalAdmin } from "@/lib/arrival/server";
import { arrivalFailure, arrivalJson } from "@/lib/arrival/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return arrivalJson({ code: "not_authenticated" }, 401);
    const { slug } = await params;
    const { data: event, error } = await db.from("events")
      .select("id,tribe_id,tribe_visibility").eq("slug", slug)
      .eq("status", "published").eq("arrival_enabled", true).maybeSingle();
    if (error) throw error;
    if (!event || (event.tribe_id && event.tribe_visibility !== "public")) return arrivalJson({ code: "event_not_found" }, 404);
    const result = await arrivalAdmin().rpc("arrival_access", { p_event_id: event.id, p_actor_id: user.id });
    if (result.error) throw result.error;
    return arrivalJson(result.data);
  } catch (error) { return arrivalFailure(error); }
}
