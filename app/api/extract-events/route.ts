import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractEventsFromImage, checkDuplicates } from "@/lib/ai-extraction";

export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Role check - must be admin or contributor
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "contributor"].includes(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Rate limiting: max 10 extractions per user per day
  const DAILY_LIMIT = 10;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: extractionCount } = await supabase
    .from("extraction_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneDayAgo);

  if (extractionCount !== null && extractionCount >= DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Maximum ${DAILY_LIMIT} extractions per day.`,
        remaining: 0,
        reset_in: "24 hours",
      },
      { status: 429 }
    );
  }

  // Parse form data
  const formData = await request.formData();
  const image = formData.get("image") as File | null;
  const organizerId = formData.get("organizer_id") as string | null;

  if (!image) {
    return NextResponse.json({ error: "Image required" }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(image.type)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, and WebP images are allowed" },
      { status: 400 }
    );
  }

  // Max 10MB
  if (image.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File must be under 10MB" },
      { status: 400 }
    );
  }

  try {
    // Upload image to extraction-uploads bucket
    const ext = image.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${user.id}/${Date.now()}.${ext}`;

    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("extraction-uploads")
      .upload(fileName, buffer, {
        contentType: image.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("extraction-uploads").getPublicUrl(fileName);

    // Extract events using Claude Vision
    const extractedEvents = await extractEventsFromImage(publicUrl);

    // Fetch existing events for deduplication (last 6 months + next year)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const oneYearAhead = new Date();
    oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

    const { data: existingEvents } = await supabase
      .from("events")
      .select("id, title, starts_at, location_name")
      .eq("status", "published")
      .gte("starts_at", sixMonthsAgo.toISOString())
      .lte("starts_at", oneYearAhead.toISOString());

    // Check for duplicates
    const eventsWithDuplicateInfo = await checkDuplicates(
      extractedEvents,
      existingEvents ?? []
    );

    // Create extraction log
    const { data: log, error: logError } = await supabase
      .from("extraction_logs")
      .insert({
        user_id: user.id,
        image_url: publicUrl,
        organizer_id: organizerId || null,
        extracted_count: eventsWithDuplicateInfo.length,
        raw_response: eventsWithDuplicateInfo,
        status: "pending",
      })
      .select()
      .single();

    if (logError) {
      console.error("Log error:", logError);
      // Continue anyway, log is for tracking only
    }

    return NextResponse.json({
      success: true,
      extraction_id: log?.id,
      image_url: publicUrl,
      events: eventsWithDuplicateInfo,
      duplicates_found: eventsWithDuplicateInfo.filter((e) => e.duplicate_of)
        .length,
      rate_limit: {
        remaining: DAILY_LIMIT - (extractionCount ?? 0) - 1,
        limit: DAILY_LIMIT,
      },
    });
  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
