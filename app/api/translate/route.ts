import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  TranslationContentType,
  TranslationFieldName,
} from "@/lib/types";

const RATE_LIMIT = 50; // requests per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface TranslateRequest {
  content_type: TranslationContentType;
  content_id: string;
  fields: {
    field_name: TranslationFieldName;
    text: string;
  }[];
  detect_language?: boolean;
}

/**
 * POST /api/translate
 * Acknowledges translation work for the Mac mini worker. Source content has
 * already been saved before clients call this route; that database row is the
 * durable queue, and the worker discovers any missing locale/field coverage.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check - translations require authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Database-backed rate limiting
  const { data: rateCheck, error: rateError } = await supabase.rpc('check_rate_limit', {
    p_action: 'translate',
    p_limit: RATE_LIMIT,
    p_window_ms: RATE_WINDOW_MS,
  });

  if (rateError) {
    console.error("[translate] Rate limit check failed:", rateError);
  } else if (!rateCheck?.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Try again later.",
        remaining: 0,
        reset_at: rateCheck?.reset_at,
      },
      { status: 429 }
    );
  }

  try {
    const body: TranslateRequest = await request.json();

    // Validation
    if (!body.content_type || !body.content_id) {
      return NextResponse.json(
        { error: "content_type and content_id are required" },
        { status: 400 }
      );
    }

    if (!body.fields || body.fields.length === 0) {
      return NextResponse.json(
        { error: "At least one field is required" },
        { status: 400 }
      );
    }

    // Filter out empty fields
    const fieldsToTranslate = body.fields.filter(
      (f) => f.text && f.text.trim().length > 0
    );

    if (fieldsToTranslate.length === 0) {
      return NextResponse.json(
        { error: "No non-empty fields to translate" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      queued: true,
      translations_count: 0,
    }, { status: 202 });
  } catch (error) {
    console.error("Translation error:", error);

    return NextResponse.json(
      { error: "Failed to queue translation" },
      { status: 500 }
    );
  }
}
