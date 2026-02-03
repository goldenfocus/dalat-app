import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createDirectUpload,
  isCloudflareStreamConfigured,
} from "@/lib/cloudflare-stream";

/**
 * POST /api/moments/upload-video
 *
 * Creates a direct upload URL for Cloudflare Stream.
 * The client uploads directly to Cloudflare using TUS protocol.
 *
 * Request body:
 * {
 *   eventId: string,
 *   filename: string,
 *   fileSizeBytes: number
 * }
 *
 * Response:
 * {
 *   uploadUrl: string,  // One-time TUS upload URL
 *   videoUid: string    // Cloudflare video UID for tracking
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check if Cloudflare Stream is configured
    if (!isCloudflareStreamConfigured()) {
      return NextResponse.json(
        { error: "Video streaming not configured" },
        { status: 503 }
      );
    }

    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { eventId, filename, fileSizeBytes } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing eventId" },
        { status: 400 }
      );
    }

    // Validate file size (max 500MB to match existing video limit)
    const maxSize = 500 * 1024 * 1024;
    if (fileSizeBytes && fileSizeBytes > maxSize) {
      return NextResponse.json(
        { error: "Video too large. Maximum size is 500MB." },
        { status: 400 }
      );
    }

    // Verify event exists
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, created_by")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Get moments settings from event_settings table (defaults if not found)
    const { data: settings } = await supabase
      .from("event_settings")
      .select("moments_enabled, moments_who_can_post")
      .eq("event_id", eventId)
      .single();

    // Default to moments enabled and anyone can post if no settings
    const momentsEnabled = settings?.moments_enabled ?? true;
    const momentsWhoCanPost = settings?.moments_who_can_post ?? "anyone";

    if (!momentsEnabled) {
      return NextResponse.json(
        { error: "Moments are disabled for this event" },
        { status: 403 }
      );
    }

    const isCreator = event.created_by === user.id;

    // Check posting permission based on event settings
    if (momentsWhoCanPost !== "anyone" && !isCreator) {
      // Get user's RSVP status
      const { data: rsvp } = await supabase
        .from("rsvps")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .single();

      const rsvpStatus = rsvp?.status;

      if (momentsWhoCanPost === "rsvp") {
        if (!rsvpStatus) {
          return NextResponse.json(
            { error: "You must RSVP to post moments" },
            { status: 403 }
          );
        }
      } else if (momentsWhoCanPost === "confirmed") {
        if (rsvpStatus !== "going") {
          return NextResponse.json(
            { error: "Only confirmed attendees can post moments" },
            { status: 403 }
          );
        }
      }
    }

    // Create direct upload URL from Cloudflare Stream
    const { uid, uploadURL } = await createDirectUpload({
      maxDurationSeconds: 3600, // 1 hour max
      meta: {
        eventId,
        userId: user.id,
        filename: filename || "video.mp4",
      },
      // Thumbnail at 10% of video duration
      thumbnailTimestampPct: 0.1,
    });

    return NextResponse.json({
      uploadUrl: uploadURL,
      videoUid: uid,
    });
  } catch (error) {
    console.error("[upload-video] Error:", error);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    );
  }
}
