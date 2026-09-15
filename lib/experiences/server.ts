import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
export const bucket = "experience-originals";
export function experienceAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function ownerExperience(id: string) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: experience } = await db
    .from("experiences")
    .select("*")
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();
  return experience ? { db, user, experience } : null;
}
export function safeMutation(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
