import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache/server-cache";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * PATCH /api/events/[slug]/tribe - attach or detach an event's hosting tribe.
 *
 * This route exists because RLS is NOT sufficient here. events_update_owner
 * authorizes on event ownership alone — it never inspects the TARGET tribe. A
 * direct client-side update would therefore let any user attach their own
 * event to someone else's tribe, surfacing it on that tribe's page and to its
 * members. Both sides are checked below.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { tribe_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const tribeId = body.tribe_id ?? null;

  const { data: event, error: fetchError } = await supabase
    .from("events")
    .select("id, created_by")
    .eq("slug", slug)
    .single();

  if (fetchError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Side 1: may this user edit this event?
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

  // Side 2: may this user host events as the TARGET tribe?
  // Mirrors the leader/admin filter the event form applies to /api/tribes/me.
  let tribe = null;
  if (tribeId) {
    const { data: membership } = await supabase
      .from("tribe_members")
      .select("role, status")
      .eq("tribe_id", tribeId)
      .eq("user_id", user.id)
      .maybeSingle();

    const canHost =
      membership?.status === "active" &&
      (membership.role === "leader" || membership.role === "admin");

    if (!canHost && !isAdmin) {
      return NextResponse.json(
        { error: "Not authorized for this tribe" },
        { status: 403 }
      );
    }

    const { data: tribeRow, error: tribeError } = await supabase
      .from("tribes")
      .select("id, slug, name, cover_image_url, access_type, settings")
      .eq("id", tribeId)
      .single();

    if (tribeError || !tribeRow) {
      return NextResponse.json({ error: "Tribe not found" }, { status: 404 });
    }
    tribe = tribeRow;
  }

  // Attaching is a promotion action, so it publishes to the feed. Narrowing an
  // event to members_only stays in the full event form, which explains it.
  const { error: updateError } = await supabase
    .from("events")
    .update(
      tribeId
        ? { tribe_id: tribeId, tribe_visibility: "public" }
        : { tribe_id: null }
    )
    .eq("id", event.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update tribe: " + updateError.message },
      { status: 500 }
    );
  }

  revalidateTag(CACHE_TAGS.events, "max");
  revalidatePath(`/events/${slug}`);
  if (tribe) revalidatePath(`/tribes/${tribe.slug}`);

  return NextResponse.json({ success: true, tribe });
}
