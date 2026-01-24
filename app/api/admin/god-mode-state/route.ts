import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getGodModeCookieName } from "@/lib/god-mode";

export async function GET() {
  const cookieStore = await cookies();
  const godModeTargetId = cookieStore.get(getGodModeCookieName())?.value;

  // No god mode cookie = not impersonating
  if (!godModeTargetId) {
    return NextResponse.json({ isActive: false, targetProfile: null });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ isActive: false, targetProfile: null });
  }

  // Verify user is a superadmin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin") {
    return NextResponse.json({ isActive: false, targetProfile: null });
  }

  // Get the target profile
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", godModeTargetId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ isActive: false, targetProfile: null });
  }

  return NextResponse.json({ isActive: true, targetProfile });
}
