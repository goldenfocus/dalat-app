import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateSmartFilename } from "@/lib/media-utils";
import { getStorageProvider } from "@/lib/storage";

// Lazy init - created on first request, not at build time
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated and authorized
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const eventId = formData.get("eventId") as string | null;

    if (!file || !eventId) {
      return NextResponse.json(
        { error: "Missing file or eventId" },
        { status: 400 }
      );
    }

    // Verify user can edit this event (creator or admin)
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, created_by")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if user is creator or admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isCreator = event.created_by === user.id;
    const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";

    if (!isCreator && !isAdmin) {
      return NextResponse.json(
        { error: "Not authorized to edit this event" },
        { status: 403 }
      );
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `File type ${file.type} not allowed` },
        { status: 400 }
      );
    }

    // Validate file size (15MB for images, 50MB for videos)
    const maxSize = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large" },
        { status: 400 }
      );
    }

    // Generate smart filename from original file name
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = generateSmartFilename(file.name, eventId, ext);

    // Convert File to Buffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload using unified storage abstraction (R2 or Supabase)
    const provider = await getStorageProvider("event-media");
    const publicUrl = await provider.upload("event-media", fileName, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true,
    });

    // Update event with new image URL
    const supabaseAdmin = getSupabaseAdmin();
    const { error: updateError } = await supabaseAdmin
      .from("events")
      .update({ image_url: publicUrl })
      .eq("id", eventId);

    if (updateError) {
      console.error("Update error:", updateError);
      // Still return the URL even if update failed
    }

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("Upload handler error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
