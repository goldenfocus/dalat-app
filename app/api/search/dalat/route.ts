import { after, NextRequest, NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { locales } from "@/lib/i18n/locales";
import { analyticsSearchQuery, cleanSearchQuery, normalizeSearchQuery, searchKinds, searchScope } from "@/lib/search/dalat";
import { searchDalat, searchStatsClient } from "@/lib/search/dalat-server";

const noCache = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = cleanSearchQuery(params.get("q") ?? "");
  if (Array.from(normalizeSearchQuery(q)).length < 2) return NextResponse.json({ results: [] }, { headers: noCache });
  const locale = params.get("locale");
  const result = await searchDalat(q, searchScope(params.get("type")), hasLocale(locales, locale) ? locale : "en", params.get("full") === "1");
  return NextResponse.json(result, { headers: noCache });
}

const signalSchema = z.object({
  query: z.string().max(200),
  scope: z.enum(["all", ...searchKinds]),
  locale: z.enum(locales),
  clicked: z.enum(searchKinds).optional(),
  empty: z.boolean().optional(),
}).strict();

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return new Response(null, { status: 413 });
  const signal = signalSchema.safeParse(await request.json().catch(() => null));
  if (!signal.success) return new Response(null, { status: 400 });
  const { query, locale, scope, clicked, empty } = signal.data;
  if (process.env.NODE_ENV === "production" && analyticsSearchQuery(query).length >= 2) {
    after(async () => {
      const db = searchStatsClient();
      if (!db) return;
      const { error } = await db.rpc("record_dalat_search", {
        p_query: query, p_locale: locale, p_scope: scope, p_clicked_kind: clicked ?? null, p_empty: empty ?? false,
      });
      if (error) console.error("Unable to record Dalat search totals", error.code);
    });
  }
  return new Response(null, { status: 204, headers: noCache });
}
