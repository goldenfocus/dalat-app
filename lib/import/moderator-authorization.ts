import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";

/**
 * Import controls can spend third-party quota and write through service-role
 * clients, so every route must verify a staff role before touching either.
 */
export async function authorizeImportModerator() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Authentication required" },
          { status: 401 },
        ),
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("[import/auth] Role lookup failed:", profileError);
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Authorization unavailable" },
          { status: 503 },
        ),
      };
    }

    const role = profile?.role as UserRole | undefined;
    if (!role || !hasRoleLevel(role, "moderator")) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Moderator access required" },
          { status: 403 },
        ),
      };
    }

    return { ok: true as const, supabase, user };
  } catch (error) {
    console.error("[import/auth] Authorization failed:", error);
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Authorization unavailable" },
        { status: 503 },
      ),
    };
  }
}
