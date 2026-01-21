import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getGodModeCookieName } from "@/lib/god-mode";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Verify user is a superadmin (only superadmins can impersonate)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin") {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  // End all active impersonation sessions for this admin
  await supabase
    .from("impersonation_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("admin_user_id", user.id)
    .is("ended_at", null);

  // Clear the God mode cookie
  const cookieStore = await cookies();
  cookieStore.delete(getGodModeCookieName());

  return NextResponse.json({ ok: true });
}
