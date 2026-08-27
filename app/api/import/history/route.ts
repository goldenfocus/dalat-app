import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type UserRole } from "@/lib/types";

/**
 * Get import history - events that were imported from external platforms
 */
export async function GET() {
  try {
    const authClient = await createClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await authClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const canReviewImports =
      !profileError &&
      profile?.role &&
      hasRoleLevel(profile.role as UserRole, "moderator");
    if (!canReviewImports) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: events, error } = await supabase
      .from("events")
      .select("id, slug, title, starts_at, source_platform, created_at, external_chat_url")
      .not("source_platform", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("History fetch error:", error);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json({ events: events || [] });
  } catch (error) {
    console.error("History error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
