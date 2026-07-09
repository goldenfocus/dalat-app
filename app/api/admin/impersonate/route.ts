import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import {
  getGodModeFlagCookieName,
  getGodModeAdminTokenCookieName,
  getGodModeSessionIdCookieName,
} from "@/lib/god-mode";

// God-mode cookies live long enough that a realistic impersonation won't
// silently expire mid-session (which would hide the Exit banner). Still bounded
// for security; exit also self-heals if the stash expires first.
const GOD_MODE_MAX_AGE = 60 * 60 * 8; // 8 hours

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Verify caller is super admin.
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (adminProfile?.role !== "superadmin") {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const body = await request.json();
  const { targetUserId } = body;

  if (!targetUserId) {
    return NextResponse.json({ error: "missing_target_user" }, { status: 400 });
  }
  if (targetUserId === user.id) {
    return NextResponse.json({ error: "cannot_impersonate_self" }, { status: 400 });
  }

  // Capture the admin's own refresh token BEFORE we overwrite the session
  // cookies, so exit can restore it. This token stays unused during the
  // impersonation, so it remains valid until the admin exits.
  const {
    data: { session: adminSession },
  } = await supabase.auth.getSession();

  if (!adminSession?.refresh_token) {
    return NextResponse.json({ error: "no_admin_session" }, { status: 500 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const adminClient = createSbClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The target's email is needed to mint a session for them.
  const { data: targetLookup, error: lookupError } =
    await adminClient.auth.admin.getUserById(targetUserId);

  if (lookupError || !targetLookup?.user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  const targetEmail = targetLookup.user.email;
  if (!targetEmail) {
    return NextResponse.json({ error: "target_has_no_email" }, { status: 400 });
  }

  // Mint a genuine login session for the target: generate a magic-link token
  // (service role, no email sent) and exchange it for real access + refresh
  // tokens on a throwaway client that does not touch our cookies.
  const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  });

  const hashedToken = link?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    console.error("Impersonation: generateLink failed:", linkError);
    return NextResponse.json({ error: "session_mint_failed" }, { status: 500 });
  }

  const verifier = createSbClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: verified, error: verifyError } = await verifier.auth.verifyOtp({
    token_hash: hashedToken,
    type: "email",
  });

  if (verifyError || !verified?.session) {
    console.error("Impersonation: verifyOtp failed:", verifyError);
    return NextResponse.json({ error: "session_mint_failed" }, { status: 500 });
  }

  // Audit log (service role — the table's RLS only allows the superadmin, and
  // once we swap the session below we'd no longer pass that check). The audit
  // row is the accountability control for this feature, so log loudly if it
  // fails rather than swallowing it (we still proceed so an admin isn't blocked
  // by a transient audit hiccup during an incident).
  const { error: endPriorError } = await adminClient
    .from("impersonation_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("admin_user_id", user.id)
    .is("ended_at", null);
  if (endPriorError) {
    console.error("Impersonation: failed to close prior audit sessions:", endPriorError);
  }

  const { data: auditRow, error: auditError } = await adminClient
    .from("impersonation_sessions")
    .insert({ admin_user_id: user.id, target_user_id: targetUserId })
    .select("id")
    .single();
  if (auditError) {
    console.error(
      `Impersonation: audit row write FAILED — admin=${user.id} target=${targetUserId} (proceeding):`,
      auditError
    );
  }

  // Swap the browser to the target by writing its tokens into the Supabase auth
  // cookies via the cookie-bound SSR client. From here, auth.getUser() and RLS
  // auth.uid() are the target everywhere — reads AND writes.
  const { error: setError } = await supabase.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });

  if (setError) {
    console.error("Impersonation: setSession failed:", setError);
    return NextResponse.json({ error: "session_swap_failed" }, { status: 500 });
  }

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";

  // Admin's refresh token — httpOnly. Presence = impersonation active.
  cookieStore.set(getGodModeAdminTokenCookieName(), adminSession.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: GOD_MODE_MAX_AGE,
  });

  // Client-readable flag so the banner shows without an API round-trip.
  cookieStore.set(getGodModeFlagCookieName(), targetUserId, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: GOD_MODE_MAX_AGE,
  });

  if (auditRow?.id) {
    cookieStore.set(getGodModeSessionIdCookieName(), auditRow.id, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: GOD_MODE_MAX_AGE,
    });
  }

  return NextResponse.json({ ok: true, targetUser: targetLookup.user });
}
