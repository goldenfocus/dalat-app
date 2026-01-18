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
