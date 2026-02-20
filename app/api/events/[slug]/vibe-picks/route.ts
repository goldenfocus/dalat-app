import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, created_by")
    .eq("slug", slug)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Check ownership (or superadmin via RLS)
  if (event.created_by !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || !["admin", "superadmin"].includes(profile.role ?? "")) {
      return NextResponse.json({ error: "Not event owner" }, { status: 403 });
    }
  }

  const { moment_ids } = await request.json() as { moment_ids: string[] };

  // Store up to 6 picks; null clears to auto-select
  const picks = Array.isArray(moment_ids) && moment_ids.length > 0
    ? moment_ids.slice(0, 6)
    : null;

  const { error } = await supabase
    .from("events")
    .update({ vibe_moment_ids: picks })
    .eq("id", event.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, vibe_moment_ids: picks });
}
