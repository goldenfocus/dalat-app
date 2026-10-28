import { createClient } from "@/lib/supabase/server";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { languagePreferencesSchema } from "@/lib/arrival/languages";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return arrivalJson({ code: "not_authenticated" }, 401);
    const { data, error } = await db.from("event_language_profiles").select("preferences").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const parsed = languagePreferencesSchema.safeParse(data?.preferences);
    return arrivalJson({ preferences: parsed.success ? parsed.data : null });
  } catch (error) { return arrivalFailure(error); }
}

export async function PUT(request: Request) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return arrivalJson({ code: "not_authenticated" }, 401);
    const parsed = languagePreferencesSchema.safeParse(await readArrivalBody(request));
    if (!parsed.success) return arrivalJson({ code: "invalid_request" }, 400);
    const { error } = await db.from("event_language_profiles").upsert({ user_id: user.id, preferences: parsed.data }, { onConflict: "user_id" });
    if (error) throw error;
    return arrivalJson({ preferences: parsed.data });
  } catch (error) { return arrivalFailure(error); }
}
