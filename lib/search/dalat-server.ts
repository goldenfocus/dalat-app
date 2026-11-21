import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createStaticClient } from "@/lib/supabase/server";
import { isPeopleEnabled } from "@/lib/people/constants";
import { getPeoplePage, getPeopleViewer } from "@/lib/people/server";
import {
  analyticsSearchQuery, searchIntent, type DalatSearchResult, type SearchKind, type SearchScope,
} from "./dalat";

type Scored = DalatSearchResult & { score: number };

export function searchStatsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

async function readPublicResults(query: string, scope: SearchScope, locale: string, limit: number): Promise<Scored[]> {
  if (scope === "people") return [];
  const db = createStaticClient();
  if (!db) throw new Error("public_search_unavailable");
  const { data, error } = await db.rpc("search_dalat_content", {
    p_query: query, p_scope: scope, p_locale: locale, p_limit: limit,
  });
  if (error) throw new Error("public_search_unavailable");
  const rows = (data ?? []) as Array<{
    id: string; kind: SearchKind; href: string; title: string; original_title: string; source_locale?: string; score: number;
  }>;
  return rows.map(row => ({
    id: row.id, kind: row.kind, href: row.href, title: row.title, score: row.score,
    ...(row.title !== row.original_title ? { originalTitle: row.original_title, sourceLocale: row.source_locale } : {}),
  }));
}

async function readPeople(query: string, scope: SearchScope, locale: string, limit: number) {
  if (!isPeopleEnabled() || (scope !== "all" && scope !== "people")) return { results: [] as Scored[], signin: false };
  const { user } = await getPeopleViewer();
  if (!user) return { results: [] as Scored[], signin: scope === "people" };
  const { people } = await getPeoplePage({ q: query.replace(/^@/, "") }, locale);
  const terms = query.toLowerCase().replace(/^@/, "");
  const results: Scored[] = people.flatMap(person => {
    const { username, display_name: name } = person.profile;
    const title = name?.trim() || username;
    if (!title) return [];
    const score = [title, username].some(value => value?.toLowerCase() === terms) ? 120
      : [title, username].some(value => value?.toLowerCase().startsWith(terms)) ? 105 : 58;
    return [{ id: person.user_id, href: "/" + encodeURIComponent(username || person.user_id), kind: "people", title, score }];
  });
  results.sort((a, b) => b.score - a.score);
  return { results: results.slice(0, limit), signin: false };
}

async function readSearchPreferences(query: string, locale: string) {
  const normalized = analyticsSearchQuery(query);
  if (normalized.length < 2) return new Map<SearchKind, number>();
  const db = searchStatsClient();
  if (!db) return new Map<SearchKind, number>();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db.from("dalat_search_daily").select("clicked_kind,clicks")
    .eq("query", normalized).eq("locale", locale).neq("clicked_kind", "").gte("day", since).limit(320)
    .abortSignal(AbortSignal.timeout(450));
  const totals = new Map<SearchKind, number>();
  for (const row of data ?? []) {
    const kind: SearchKind = row.clicked_kind;
    totals.set(kind, (totals.get(kind) ?? 0) + Number(row.clicks));
  }
  return totals;
}

export async function searchDalat(query: string, scope: SearchScope, locale: string, full: boolean) {
  const limit = full ? 60 : 24;
  const [publicResults, people, preferences] = await Promise.allSettled([
    readPublicResults(query, scope, locale, limit),
    readPeople(query, scope, locale, full ? 24 : 4),
    scope === "all" ? readSearchPreferences(query, locale) : new Map<SearchKind, number>(),
  ]);
  const preferred = preferences.status === "fulfilled" ? preferences.value : new Map<SearchKind, number>();
  const intent = query.startsWith("@") ? "people" : searchIntent(query);
  const byType = new Map<SearchKind, number>();
  const score = (row: Scored) => {
    const clicks = preferred.get(row.kind) ?? 0;
    return row.score + (intent === row.kind ? 12 : 0) + (clicks >= 5 ? Math.min(10, Math.floor(Math.sqrt(clicks))) : 0);
  };
  const combined = [
    ...(publicResults.status === "fulfilled" ? publicResults.value : []),
    ...(people.status === "fulfilled" ? people.value.results : []),
  ].sort((a, b) => score(b) - score(a));
  const results = combined.filter(row => {
    if (scope !== "all") return true;
    const count = byType.get(row.kind) ?? 0;
    byType.set(row.kind, count + 1);
    return count < (full ? 8 : 3);
  }).slice(0, full ? 60 : 9).map(({ score: _, ...row }) => row);
  return {
    results,
    signin: people.status === "fulfilled" && people.value.signin,
    degraded: publicResults.status === "rejected" || people.status === "rejected",
  };
}
