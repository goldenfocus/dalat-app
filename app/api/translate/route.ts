import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { batchTranslateFields } from "@/lib/google-translate";
import {
  CONTENT_LOCALES,
  TranslationContentType,
  TranslationFieldName,
} from "@/lib/types";
import { CACHE_TAGS } from "@/lib/cache/server-cache";

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
 * Translates content to all 12 supported languages using Google Cloud Translation API
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

    // Call Google Translate API
    const { detectedLocale, translations } = await batchTranslateFields(
      fieldsToTranslate
    );

    // Update source_locale on the content
    if (body.content_type === "event") {
      await supabase
        .from("events")
        .update({ source_locale: detectedLocale })
        .eq("id", body.content_id);
    } else if (body.content_type === "moment") {
      await supabase
        .from("moments")
        .update({ source_locale: detectedLocale })
        .eq("id", body.content_id);
    } else if (body.content_type === "profile") {
      await supabase
        .from("profiles")
        .update({ bio_source_locale: detectedLocale })
        .eq("id", body.content_id);
    } else if (body.content_type === "venue") {
      await supabase
        .from("venues")
        .update({ source_locale: detectedLocale })
        .eq("id", body.content_id);
    } else if (body.content_type === "comment") {
      await supabase
        .from("comments")
        .update({ source_locale: detectedLocale })
        .eq("id", body.content_id);
    }

    // Prepare translation inserts
    const translationInserts: {
      content_type: string;
      content_id: string;
      source_locale: string;
      target_locale: string;
      field_name: string;
      translated_text: string;
      translation_status: string;
    }[] = [];

    for (const locale of CONTENT_LOCALES) {
      // Skip same-language translations - they're useless and can contain incorrect data
      if (locale === detectedLocale) continue;

      const localeTranslations = translations[locale];
      if (!localeTranslations) continue;

      for (const field of fieldsToTranslate) {
        const translatedText = localeTranslations[field.field_name];
        if (!translatedText) continue;

        translationInserts.push({
          content_type: body.content_type,
          content_id: body.content_id,
          source_locale: detectedLocale,
          target_locale: locale,
          field_name: field.field_name,
          translated_text: translatedText,
          translation_status: "auto",
        });
      }
    }

    // Upsert translations (update if exists, insert if not)
    if (translationInserts.length > 0) {
      const { error: insertError } = await supabase
        .from("content_translations")
        .upsert(translationInserts, {
          onConflict: "content_type,content_id,target_locale,field_name",
        });

      if (insertError) {
        console.error("Translation insert error:", insertError);
        // Don't fail the request - translations might still be useful to return
      } else {
        // Invalidate the translations cache so new translations appear immediately
        revalidateTag(CACHE_TAGS.translations, "max");
      }
    }

    return NextResponse.json({
      success: true,
      source_locale: detectedLocale,
      translations_count: translationInserts.length,
      translations,
    });
  } catch (error) {
    console.error("Translation error:", error);

    if (error instanceof Error) {
      if (error.message.includes("API key") || error.message.includes("GOOGLE_CLOUD")) {
        return NextResponse.json(
          { error: "Translation service not configured. Check GOOGLE_CLOUD_TRANSLATION_API_KEY." },
          { status: 503 }
        );
      }
      if (error.message.includes("rate") || error.message.includes("limit") || error.message.includes("quota")) {
        return NextResponse.json(
          { error: "Translation service busy. Try again in a moment." },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to translate content" },
      { status: 500 }
    );
  }
}
