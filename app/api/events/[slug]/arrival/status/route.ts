import { createClient } from "@/lib/supabase/server";
import { arrivalAdmin, guestToken, tokenHash } from "@/lib/arrival/server";
import { arrivalFailure, arrivalJson } from "@/lib/arrival/http";

export const dynamic = "force-dynamic";

/** Read only this browser/account's attendance; no receipt or order data is exposed. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    const { data: event, error } = await db.from("events").select("id,tribe_id,tribe_visibility")
      .eq("slug", slug).eq("status", "published").eq("arrival_enabled", true).maybeSingle();
    if (error) throw error;
    if (!event || (event.tribe_id && event.tribe_visibility !== "public")) return arrivalJson({ code: "event_not_found" }, 404);
    const token = await guestToken(event.id);
    if (!user && !token) return arrivalJson({ checkedIn: false });
    const admin = arrivalAdmin();
    for (const [column, value] of [["user_id", user?.id], ["token_hash", token ? tokenHash(token) : null]] as const) {
      if (!value) continue;
      const result = await admin.from("event_arrival_participants").select("id")
        .eq("event_id", event.id).eq(column, value).maybeSingle();
      if (result.error) throw result.error;
      if (result.data) return arrivalJson({ checkedIn: true });
    }
    if (user) {
      const result = await admin.from("rsvps").select("id").eq("event_id", event.id)
        .eq("user_id", user.id).eq("status", "going").not("checked_in_at", "is", null).maybeSingle();
      if (result.error) throw result.error;
      if (result.data) return arrivalJson({ checkedIn: true });
    }
    return arrivalJson({ checkedIn: false });
  } catch (error) { return arrivalFailure(error); }
}
