"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { HostArrivals } from "./host-arrivals";
import { HostOrders } from "./host-orders";
import { HostTeam } from "./host-team";
import { DrinkOfferSettings } from "./drink-offer-settings";
import { SponsorLedger } from "./sponsor-ledger";
import type { HostData } from "./host-types";

type Tab = "arrivals" | "orders" | "sponsor" | "team";

export function HostWorkspace({ slug }: { slug: string }) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  const [data, setData] = useState<HostData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("arrivals");
  const sequence = useRef(0);
  const endpoint = `/api/events/${encodeURIComponent(slug)}/arrival/staff`;

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setRefreshing(true);
    try {
      const response = await fetch(`${endpoint}?locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
      if (current !== sequence.current) return;
      if (response.status === 401) {
        window.location.assign(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (response.status === 403) { setForbidden(true); return; }
      if (!response.ok) throw new Error("load");
      const result = await response.json() as HostData;
      if (current !== sequence.current) return;
      setData(result);
      setError(null);
      setLastUpdated(new Date());
    } catch {
      if (current === sequence.current) setError(t("hostLoadError"));
    } finally {
      if (current === sequence.current) setRefreshing(false);
    }
  }, [endpoint, locale, t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 5000);
    return () => { window.clearInterval(timer); };
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(t(response.status === 409 ? "hostConflict" : "hostSaveError"));
        await load();
        // A successful reload must not erase the mutation error.
        setError(t(response.status === 409 ? "hostConflict" : "hostSaveError"));
        return false;
      }
      await load();
      return true;
    } catch { setError(t("hostSaveError")); return false; }
    finally { setBusy(false); }
  };

  const guestPath = `${locale === "en" ? "" : `/${locale}`}/events/${encodeURIComponent(slug)}/arrive`;
  const tabs: Tab[] = data ? [
    ...(data.access.canWelcome ? ["arrivals" as const] : []),
    ...(data.access.canOrder ? ["orders" as const] : []),
    ...(data.access.canManage && data.sponsorAccounting ? ["sponsor" as const] : []),
    ...(data.access.canManage ? ["team" as const] : []),
  ] : [];
  const visibleTab = tabs.includes(tab) ? tab : tabs[0];

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-28 pt-6 sm:px-6">
      <Link href={`/events/${slug}`} className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft aria-hidden className="h-4 w-4" />{t("backToEvent")}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{t("staffDesk")}</h1>
      {data && <p className="mt-2 text-muted-foreground">{data.event.title}{data.event.venueName ? ` · ${data.event.venueName}` : ""}</p>}
      {forbidden ? <section className="mt-8 border-l-2 border-destructive p-4"><h2 className="font-semibold">{t("hostForbidden")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("hostAskAccess")}</p></section> : <>
        <div className="my-5 flex flex-wrap items-center justify-between gap-2 border-y py-2">
          <p className="text-xs text-muted-foreground" role="status">{lastUpdated ? t("hostUpdated", { time: lastUpdated.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }) : t("loading")}</p>
          <button type="button" className="flex min-h-11 items-center gap-2 px-3 text-sm" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw aria-hidden className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{t("refresh")}
          </button>
        </div>
        {error && <p role="alert" className="mb-4 border-l-2 border-destructive bg-destructive/5 p-3 text-sm">{error}</p>}
        {data && <>
          <nav aria-label={t("hostTabs")} className="mb-6 flex overflow-x-auto border-b">
            {tabs.map(item => (
              <button type="button" key={item} onClick={() => setTab(item)} aria-current={visibleTab === item ? "page" : undefined} className={`min-h-12 flex-1 whitespace-nowrap border-b-2 px-4 font-medium ${visibleTab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
                {t(`host${item === "arrivals" ? "Arrivals" : item === "orders" ? "Orders" : item === "sponsor" ? "Sponsor" : "Team"}`)}
              </button>
            ))}
          </nav>
          {visibleTab === "arrivals" && data.access.canWelcome && <HostArrivals data={data} slug={slug} guestPath={guestPath} busy={busy} onSaved={load} />}
          {visibleTab === "orders" && data.access.canOrder && <HostOrders orders={data.orders} busy={busy} act={act} />}
          {visibleTab === "sponsor" && data.access.canManage && <>{data.event.sponsorship && <DrinkOfferSettings key={data.event.sponsorship.rsvpLimit} slug={slug} limit={data.event.sponsorship.rsvpLimit ?? 100} onSaved={load} />}<SponsorLedger data={data} busy={busy} act={act} /></>}
          {visibleTab === "team" && data.access.canManage && <HostTeam staff={data.staff} busy={busy} act={act} />}
        </>}
      </>}
    </main>
  );
}
