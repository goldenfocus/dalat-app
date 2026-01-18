import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getGodModeCookieName } from "@/lib/god-mode";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Verify caller is super admin
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (adminProfile?.role !== "superadmin") {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  // Parse request body
  const body = await request.json();
  const { targetUserId } = body;

  if (!targetUserId) {
    return NextResponse.json({ error: "missing_target_user" }, { status: 400 });
  }

  // Cannot impersonate yourself
  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "cannot_impersonate_self" },
      { status: 400 }
    );
  }

  // Verify target user exists
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", targetUserId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // End any existing active sessions
  await supabase
    .from("impersonation_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("admin_user_id", user.id)
    .is("ended_at", null);

  // Create new impersonation session
  const { data: session, error: sessionError } = await supabase
    .from("impersonation_sessions")
    .insert({
      admin_user_id: user.id,
      target_user_id: targetUserId,
    })
    .select()
    .single();

  if (sessionError) {
    console.error("Failed to create impersonation session:", sessionError);
    return NextResponse.json(
      { error: "session_creation_failed" },
      { status: 500 }
    );
  }

  // Set the God mode cookie
  const cookieStore = await cookies();
  cookieStore.set(getGodModeCookieName(), targetUserId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours max
  });

  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    targetUser: targetProfile,
  });
}
