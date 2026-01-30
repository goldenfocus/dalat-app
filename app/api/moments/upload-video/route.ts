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

    // Verify event exists and user has permission to post moments
    // We check the same permissions as create_moment RPC
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, moments_enabled, moments_who_can_post, creator_id")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.moments_enabled) {
      return NextResponse.json(
        { error: "Moments are disabled for this event" },
        { status: 403 }
      );
    }

    // Check posting permission based on event settings
    if (event.moments_who_can_post !== "anyone") {
      // Get user's RSVP status
      const { data: rsvp } = await supabase
        .from("event_rsvps")
        .select("role")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .single();

      const isCreator = event.creator_id === user.id;
      const userRole = rsvp?.role;

      if (event.moments_who_can_post === "rsvp") {
        if (!userRole && !isCreator) {
          return NextResponse.json(
            { error: "You must RSVP to post moments" },
            { status: 403 }
          );
        }
      } else if (event.moments_who_can_post === "confirmed") {
        const allowedRoles = ["going", "host", "cohost", "speaker"];
        if (!allowedRoles.includes(userRole || "") && !isCreator) {
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
