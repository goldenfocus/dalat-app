import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";
import { hasRoleLevel, type UserRole } from "@/lib/types";

/**
 * POST /api/blog/publish-recap  { blogPostId }
 *
 * Moderator-only: stamps recap_published_at so the recap card renders on
 * the event page. The post's status stays 'draft' — it must never appear
 * on blog surfaces. The update runs on the service-role client because
 * blog_posts RLS write policies don't cover moderators; the role check
 * above is the auth gate.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role || !hasRoleLevel(profile.role as UserRole, "moderator")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { blogPostId } = (await request.json()) as { blogPostId: string };
  if (!blogPostId) {
    return NextResponse.json({ error: "blogPostId required" }, { status: 400 });
  }

  const admin = getImageJobsAdmin();
  const { data: post, error } = await admin
    .from("blog_posts")
    .update({ recap_published_at: new Date().toISOString() })
    .eq("id", blogPostId)
    .not("event_id", "is", null)
    .select("event_id, events(slug)")
    .single();

  if (error || !post) {
    return NextResponse.json(
      { error: error?.message || "Not a recap post" },
      { status: 400 }
    );
  }

  const slug = (post.events as unknown as { slug: string } | null)?.slug;
  if (slug) revalidatePath(`/events/${slug}`);

  return NextResponse.json({ ok: true });
}
