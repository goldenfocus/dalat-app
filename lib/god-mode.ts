import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

// Client-readable flag cookie. Its presence tells the client to render the
// "Viewing as …" banner. Value = the impersonated user's id. Name kept stable
// so existing client-side checks (`document.cookie.includes("god_mode_user_id=")`)
// keep working.
const GOD_MODE_FLAG_COOKIE = "god_mode_user_id";

// httpOnly cookie holding the ADMIN's own refresh token so we can restore the
// admin session on exit. Its presence is the server-side proof that an
// impersonation is genuinely active — only the impersonate route sets it, and
// only after verifying the caller is a superadmin.
const GOD_MODE_ADMIN_TOKEN_COOKIE = "god_mode_admin_token";

// httpOnly cookie holding the audit row id so exit can close the log entry.
const GOD_MODE_SESSION_ID_COOKIE = "god_mode_session_id";

export interface GodModeState {
  isActive: boolean;
  realAdminId: string | null;
  targetUserId: string | null;
  targetProfile: Profile | null;
}

interface EffectiveUserResult {
  user: User | null;
  profile: Profile | null;
  godMode: GodModeState;
}

const INACTIVE_GOD_MODE: GodModeState = {
  isActive: false,
  realAdminId: null,
  targetUserId: null,
  targetProfile: null,
};

/**
 * Get the effective user for the current request.
 *
 * With TRUE session impersonation the authenticated session already *is* the
 * target user — `auth.getUser()` returns the target and RLS `auth.uid()` is the
 * target everywhere. So there is nothing to swap here: we just return the real
 * user/profile. The `godMode` field is always inactive so callers use their
 * normal self-service write paths (which now correctly act as the target)
 * rather than admin-override parameters that the target's session can't use.
 */
export async function getEffectiveUser(): Promise<EffectiveUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null, godMode: INACTIVE_GOD_MODE };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { user, profile, godMode: INACTIVE_GOD_MODE };
}

/**
 * Check if current user can use God mode (super admin only)
 */
export async function canUseGodMode(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role === "superadmin";
}

/** Whether an impersonation is currently active (server-side, authoritative). */
export async function isImpersonating(): Promise<boolean> {
  const cookieStore = await cookies();
  return !!cookieStore.get(GOD_MODE_ADMIN_TOKEN_COOKIE)?.value;
}

export function getGodModeFlagCookieName(): string {
  return GOD_MODE_FLAG_COOKIE;
}

export function getGodModeAdminTokenCookieName(): string {
  return GOD_MODE_ADMIN_TOKEN_COOKIE;
}

export function getGodModeSessionIdCookieName(): string {
  return GOD_MODE_SESSION_ID_COOKIE;
}

/** @deprecated use {@link getGodModeFlagCookieName}. Kept for import compat. */
export function getGodModeCookieName(): string {
  return GOD_MODE_FLAG_COOKIE;
}
