import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// All supported locales for revalidation
const LOCALES = ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'];

/** Revalidate pages across all locales */
function revalidateAllLocales(paths: string[]) {
  for (const locale of LOCALES) {
    for (const path of paths) {
      revalidatePath(`/${locale}${path}`);
    }
  }
}

/**
 * POST /api/moments/[id]/cover
 * Set this moment as the cover for its event's album.
 * Only event organizer or superadmin can do this.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: momentId } = await params;
    const supabase = await createClient();

    // Get the moment's event_id
    const { data: moment, error: momentError } = await supabase
      .from("moments")
      .select("event_id")
      .eq("id", momentId)
      .single();

    if (momentError || !moment) {
      return NextResponse.json(
        { error: "Moment not found" },
        { status: 404 }
      );
    }

    // Get event slug for revalidation
    const { data: event } = await supabase
      .from("events")
      .select("slug")
      .eq("id", moment.event_id)
      .single();

    // Call RPC to set cover (handles auth checks)
    const { error } = await supabase.rpc("set_event_cover_moment", {
      p_event_id: moment.event_id,
      p_moment_id: momentId,
    });

    if (error) {
      console.error("Set cover error:", error);
      if (error.message.includes("Not authorized")) {
        return NextResponse.json(
          { error: "Not authorized to set cover" },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Revalidate pages that show moments across all locales
    const pathsToRevalidate = [""];  // Homepage
    if (event?.slug) {
      pathsToRevalidate.push(`/events/${event.slug}`);
      pathsToRevalidate.push(`/events/${event.slug}/moments`);
    }
    revalidateAllLocales(pathsToRevalidate);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cover API error:", error);
    return NextResponse.json(
      { error: "Failed to set cover" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/moments/[id]/cover
 * Remove this moment as the cover (revert to auto-selection).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: momentId } = await params;
    const supabase = await createClient();

    // Get the moment's event_id
    const { data: moment, error: momentError } = await supabase
      .from("moments")
      .select("event_id")
      .eq("id", momentId)
      .single();

    if (momentError || !moment) {
      return NextResponse.json(
        { error: "Moment not found" },
        { status: 404 }
      );
    }

    // Get event slug for revalidation
    const { data: event } = await supabase
      .from("events")
      .select("slug")
      .eq("id", moment.event_id)
      .single();

    // Call RPC to clear cover (set to null)
    const { error } = await supabase.rpc("set_event_cover_moment", {
      p_event_id: moment.event_id,
      p_moment_id: null,
    });

    if (error) {
      console.error("Clear cover error:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Revalidate pages that show moments across all locales
    const pathsToRevalidate = [""];  // Homepage
    if (event?.slug) {
      pathsToRevalidate.push(`/events/${event.slug}`);
      pathsToRevalidate.push(`/events/${event.slug}/moments`);
    }
    revalidateAllLocales(pathsToRevalidate);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cover API error:", error);
    return NextResponse.json(
      { error: "Failed to clear cover" },
      { status: 500 }
    );
  }
}
