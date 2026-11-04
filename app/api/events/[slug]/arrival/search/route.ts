import type { NextRequest } from "next/server";
import { z } from "zod";
import { arrivalContext, tokenHash } from "@/lib/arrival/server";
import { arrivalFailure, arrivalJson, arrivalMutationAllowed, readArrivalBody } from "@/lib/arrival/http";
import { languagePreferencesSchema } from "@/lib/arrival/legacy-languages";
import type { LanguagePreferences } from "@/lib/arrival/languages";

export const dynamic = "force-dynamic";
const searchSchema = z.object({ query: z.string().trim().min(2).max(200) }).strict();

// POST keeps a guest's email out of URLs, browser history and access logs.
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!arrivalMutationAllowed(request)) return arrivalJson({ code: "forbidden" }, 403);
  const parsed = searchSchema.safeParse(await readArrivalBody(request));
  if (!parsed.success) return arrivalJson({ code: "invalid_request" }, 400);
  try {
    const { slug } = await params;
    const { admin, user, event, access } = await arrivalContext(slug);
    if (!user) return arrivalJson({ code: "not_authenticated" }, 401);
    if (!access.canWelcome) return arrivalJson({ code: "forbidden" }, 403);
    const limit = await admin.rpc("arrival_rate_limit", { p_key: tokenHash(`account-search:${event.id}:${user.id}`), p_limit: 120 });
    if (limit.error) throw limit.error;
    if (!limit.data) return arrivalJson({ code: "rate_limited" }, 429);
    const { data, error } = await admin.rpc("arrival_search_accounts", { p_event_id: event.id, p_actor_id: user.id, p_query: parsed.data.query });
    if (error) throw error;
    const accounts = (data || []) as { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null }[];
    const ids = accounts.map(account => account.user_id);
    const [legacy, languages] = ids.length ? await Promise.all([
      admin.from("language_exchange_preferences").select("user_id,practice_language,english_level,vietnamese_level").in("user_id", ids),
      admin.from("event_language_profiles").select("user_id,preferences").in("user_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (legacy.error) throw legacy.error;
    if (languages.error) throw languages.error;
    return arrivalJson({ accounts: accounts.map(account => {
      const saved = legacy.data?.find(row => row.user_id === account.user_id);
      const preferences = languagePreferencesSchema.safeParse(saved && { practiceLanguage: saved.practice_language, englishLevel: saved.english_level, vietnameseLevel: saved.vietnamese_level });
      return { id: `account:${account.user_id}`, user_id: account.user_id, displayName: account.display_name || account.username || "", username: account.username, avatarUrl: account.avatar_url, checked_in_at: null,
        preferences: preferences.success ? preferences.data : null,
        languagePreferences: (languages.data?.find(row => row.user_id === account.user_id)?.preferences as LanguagePreferences) || null };
    }) });
  } catch (error) { return arrivalFailure(error); }
}
