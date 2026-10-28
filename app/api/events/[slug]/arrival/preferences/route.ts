import type { NextRequest } from "next/server";
import { arrivalContext } from "@/lib/arrival/server";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { languagePreferencesSchema } from "@/lib/arrival/legacy-languages";
import { getLanguagePreferences } from "@/lib/arrival/preferences";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { slug } = await params;
    const { user } = await arrivalContext(slug);
    if (!user) return arrivalJson({ code: "not_authenticated" }, 401);
    return arrivalJson({ preferences: await getLanguagePreferences(user.id) });
  } catch (error) { return arrivalFailure(error); }
}

export async function POST(request: NextRequest, { params }: Context) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  const parsed = languagePreferencesSchema.safeParse(await readArrivalBody(request));
  if (!parsed.success) return arrivalJson({ code: "invalid_request" }, 400);
  try {
    const { slug } = await params;
    const { admin, user } = await arrivalContext(slug);
    if (!user) return arrivalJson({ code: "not_authenticated" }, 401);
    const { practiceLanguage, englishLevel, vietnameseLevel } = parsed.data;
    const { error } = await admin.from("language_exchange_preferences").upsert({ user_id: user.id, practice_language: practiceLanguage, english_level: englishLevel, vietnamese_level: vietnameseLevel, updated_at: new Date().toISOString() });
    if (error) throw error;
    return arrivalJson({ preferences: parsed.data });
  } catch (error) { return arrivalFailure(error); }
}
