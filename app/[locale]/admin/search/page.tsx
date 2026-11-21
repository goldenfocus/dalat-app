import { getTranslations } from "next-intl/server";
import { Link, redirect, type Locale } from "@/lib/i18n/routing";
import { searchStatsClient } from "@/lib/search/dalat-server";
import { createClient } from "@/lib/supabase/server";

type StatsRow = { query: string; searches: number; empty_searches: number; clicks: number };

export default async function SearchStatsPage({ params, searchParams }: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ locale }, { page: requested }] = await Promise.all([params, searchParams]);
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { data: profile } = user
    ? await db.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  if (profile?.role !== "admin" && profile?.role !== "superadmin") return redirect({ href: "/admin", locale });

  const page = Math.min(201, Math.max(1, Number.parseInt(requested ?? "1", 10) || 1));
  const stats = searchStatsClient();
  const [t, common, response] = await Promise.all([
    getTranslations("home"),
    getTranslations("common"),
    stats?.rpc("get_dalat_search_stats", { p_offset: (page - 1) * 50 }),
  ]);
  const rows = (response?.data ?? []) as StatsRow[];
  const format = new Intl.NumberFormat(locale);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("search.globalStats")}</h1>
      {response?.error || !response
        ? <p role="alert">{common("error")}</p>
        : rows.length
          ? <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-start">
                  <tr>
                    <th scope="col" className="p-3 text-start">{t("search.globalQuery")}</th>
                    <th scope="col" className="p-3 text-end">{t("search.globalSearches")}</th>
                    <th scope="col" className="p-3 text-end">{t("search.globalZeroResults")}</th>
                    <th scope="col" className="p-3 text-end">{t("search.globalClicks")}</th>
                  </tr>
                </thead>
                <tbody>{rows.slice(0, 50).map(row => (
                  <tr key={row.query} className="border-t">
                    <th scope="row" className="break-words p-3 text-start font-medium">{row.query}</th>
                    <td className="p-3 text-end tabular-nums">{format.format(row.searches)}</td>
                    <td className="p-3 text-end tabular-nums">{format.format(row.empty_searches)}</td>
                    <td className="p-3 text-end tabular-nums">{format.format(row.clicks)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          : <p>{common("noData")}</p>}
      <div className="flex gap-4">
        {page > 1 && <Link href={"/admin/search?page=" + (page - 1)}>{common("previous")}</Link>}
        {rows.length > 50 && <Link href={"/admin/search?page=" + (page + 1)}>{common("next")}</Link>}
      </div>
    </section>
  );
}
