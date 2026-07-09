import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getGodModeAdminTokenCookieName } from "@/lib/god-mode";

export async function GET() {
  const cookieStore = await cookies();
  // The httpOnly admin-token stash is the source of truth: it is only set by
  // the impersonate route after verifying superadmin. The current session IS
  // the impersonated target, so we return their profile for the banner.
  const impersonating = !!cookieStore.get(getGodModeAdminTokenCookieName())?.value;

  if (!impersonating) {
    return NextResponse.json({ isActive: false, targetProfile: null });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ isActive: false, targetProfile: null });
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ isActive: false, targetProfile: null });
  }

  return NextResponse.json({ isActive: true, targetProfile });
}
