import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/events/tony-miller
 * Tony Miller Exhibition API
 * Migrated from pages/api/events/tony-miller.js
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", "9258d8c9-da9e-4c13-86ef-4d7d54e4d740")
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to fetch Tony Miller exhibition",
          message: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "SUCCESS: Tony Miller Exhibition Found!",
      event: data,
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
