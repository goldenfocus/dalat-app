import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Query for Tony Miller event - flexible search
    const { data, error } = await supabase
      .from("events")
      .select("id, title, description, location_name, starts_at, image_url")
      .ilike("title", "%Tony%Miller%")
      .limit(1);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        {
          status: "ERROR",
          message: error.message,
          hint: "Database query failed",
        },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        status: "NOT_FOUND",
        message: "Tony Miller exhibition not found in database",
        suggestion: "Event may have been removed or renamed",
      }, { status: 404 });
    }

    return NextResponse.json({
      status: "SUCCESS",
      event: data[0],
    });
  } catch (err: any) {
    console.error("API error:", err);
    return NextResponse.json(
      {
        status: "ERROR",
        message: err?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
