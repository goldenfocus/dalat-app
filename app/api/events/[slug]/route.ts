import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache/server-cache";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * DELETE /api/events/[slug] - Delete an event
 *
 * Deletion must happen server-side so caches get revalidated: the old
 * client-side supabase delete left the event on the ISR homepage and
 * event listings until their TTLs expired.
 */
export async function DELETE(request: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: event, error: fetchError } = await supabase
    .from("events")
    .select("id, created_by")
    .eq("slug", slug)
    .single();

  if (fetchError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Check if user is creator or admin
  const isCreator = event.created_by === user.id;
  let isAdmin = false;
  if (!isCreator) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
  }

  if (!isCreator && !isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { error: deleteError } = await supabase
    .from("events")
    .delete()
    .eq("id", event.id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete event: " + deleteError.message },
      { status: 500 }
    );
  }

  // Revalidate homepage and event caches so the event disappears immediately
  revalidateTag(CACHE_TAGS.events, "max");
  revalidatePath("/");
  revalidatePath(`/events/${slug}`);

  return NextResponse.json({ success: true });
}
