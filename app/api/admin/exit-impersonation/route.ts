import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import {
  getGodModeFlagCookieName,
  getGodModeAdminTokenCookieName,
  getGodModeSessionIdCookieName,
} from "@/lib/god-mode";

export async function POST() {
  const cookieStore = await cookies();
  const adminRefresh = cookieStore.get(getGodModeAdminTokenCookieName())?.value;
  const sessionId = cookieStore.get(getGodModeSessionIdCookieName())?.value;

  const clearGodModeCookies = () => {
    cookieStore.delete(getGodModeFlagCookieName());
    cookieStore.delete(getGodModeAdminTokenCookieName());
    cookieStore.delete(getGodModeSessionIdCookieName());
  };

  // No admin token to restore from. Two cases:
  //  - normal user hit this route → nothing to do.
  //  - stash expired while still impersonating (the target session outlives the
  //    stash) → the browser is stranded as the target. Sign out cleanly so the
  //    admin lands logged-out and can sign back in as themselves, rather than
  //    being silently stuck as someone else.
  if (!adminRefresh) {
    const stillImpersonating = !!cookieStore.get(getGodModeFlagCookieName())?.value;
    if (stillImpersonating) {
      const supabase = await createClient();
      await supabase.auth.signOut();
    }
    clearGodModeCookies();
    return NextResponse.json({ ok: true, restored: false });
  }

  // Restore the admin session from the stashed refresh token. This overwrites
  // the target's auth cookies with a fresh admin session.
  const supabase = await createClient();
  const { error: restoreError } = await supabase.auth.refreshSession({
    refresh_token: adminRefresh,
  });

  // Close the audit row (service role — the table's RLS restricts writes).
  if (sessionId) {
    const adminClient = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    await adminClient
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .is("ended_at", null);
  }

  clearGodModeCookies();

  if (restoreError) {
    console.error("Exit impersonation: refreshSession failed:", restoreError);
    // Stash likely expired. Cookies are cleared; the browser is signed out and
    // the admin can log back in.
    return NextResponse.json({ error: "restore_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, restored: true });
}
