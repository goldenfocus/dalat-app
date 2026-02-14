import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/events/tony-miller
 * Tony Miller Exhibition API
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Try to find Tony Miller event by slug or ID
    const { data, error } = await supabase
      .from("events")
      .select("id, title, description, location_name, starts_at, image_url, status")
      .or('id.eq.9258d8c9-da9e-4c13-86ef-4d7d54e4d740,slug.ilike.*tony-miller*')
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          error: "Database error",
          message: error.message,
        },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        {
          error: "Event not found",
          message: "Tony Miller exhibition not found in database",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: "SUCCESS: Tony Miller Exhibition Found!",
      event: data[0],
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Failed to fetch Tony Miller exhibition",
        message: err?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
