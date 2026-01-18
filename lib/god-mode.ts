import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

const GOD_MODE_COOKIE = "god_mode_user_id";
const SUPER_ADMIN_USERNAME = "yan";

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

/**
 * Get the effective user for the current request.
 * In God mode, returns the impersonated user's profile.
 * Otherwise, returns the actual authenticated user's profile.
 */
export async function getEffectiveUser(): Promise<EffectiveUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const inactiveGodMode: GodModeState = {
    isActive: false,
    realAdminId: null,
    targetUserId: null,
    targetProfile: null,
  };

  if (!user) {
    return { user: null, profile: null, godMode: inactiveGodMode };
  }

  // Get real user's profile
  const { data: realProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Check if current user is super admin
  const isSuperAdmin = realProfile?.username === SUPER_ADMIN_USERNAME;

  // Check for God mode cookie
  const cookieStore = await cookies();
  const godModeTargetId = cookieStore.get(GOD_MODE_COOKIE)?.value;

  if (godModeTargetId && isSuperAdmin) {
    // Fetch the target user's profile
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", godModeTargetId)
      .single();

    if (targetProfile) {
      return {
        user,
        profile: targetProfile, // Return target profile as "effective"
        godMode: {
          isActive: true,
          realAdminId: user.id,
          targetUserId: godModeTargetId,
          targetProfile,
        },
      };
    }
  }

  return {
    user,
    profile: realProfile,
    godMode: inactiveGodMode,
  };
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
    .select("username")
    .eq("id", user.id)
    .single();

  return profile?.username === SUPER_ADMIN_USERNAME;
}

/**
 * Get the God mode cookie name (for API routes)
 */
export function getGodModeCookieName(): string {
  return GOD_MODE_COOKIE;
}

/**
 * Get the super admin username
 */
export function getSuperAdminUsername(): string {
  return SUPER_ADMIN_USERNAME;
}
