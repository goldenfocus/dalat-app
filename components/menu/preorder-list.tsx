import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatInDaLatAsync } from "@/lib/timezone";
import { formatVnd } from "@/lib/menu/format";
import type { Locale } from "@/lib/types";
import { PreorderStatusButtons } from "./preorder-status-buttons";

type Row = {
  id: string;
  status: "pending" | "confirmed" | "fulfilled" | "cancelled";
  total_vnd: number;
  note: string | null;
  phone: string | null;
  created_at: string;
  is_reservation: boolean;
  participant_id: string | null;
  sponsor_status: string;
  events: { slug: string; title: string; starts_at: string } | null;
  profiles: { display_name: string | null; username: string | null } | null;
  event_preorder_items: { name_snapshot: string; qty: number }[];
};

/** Preorders for events at this venue that haven't ended yet (RLS limits this to venue editors). */
export async function PreorderList({ venueId, locale }: { venueId: string; locale: string }) {
  const t = await getTranslations("venueMenu");
  const db = await createClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await db
    .from("event_preorders")
    .select(
      "id,status,total_vnd,note,phone,created_at,is_reservation,participant_id,sponsor_status,events!inner(slug,title,starts_at),profiles!event_preorders_user_id_fkey(display_name,username),event_preorder_items(name_snapshot,qty)",
    )
    .eq("venue_id", venueId)
    .gte("events.starts_at", since)
    .order("created_at", { ascending: false });
  // Never render "no preorders" when we simply failed to load them — staff would prep nothing.
  if (error) throw new Error(`Loading preorders failed: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];

  const byEvent = new Map<string, { title: string; startsAt: string; rows: Row[] }>();
  for (const r of rows) {
    if (!r.events) continue;
    const g = byEvent.get(r.events.slug) ?? { title: r.events.title, startsAt: r.events.starts_at, rows: [] };
    g.rows.push(r);
    byEvent.set(r.events.slug, g);
  }

  const eventDates = new Map(await Promise.all([...byEvent.entries()].map(async ([slug, g]) =>
    [slug, await formatInDaLatAsync(g.startsAt, "EEE, MMM d · HH:mm", locale as Locale)] as const)));

  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">{t("preordersTitle")}</h2>
      {byEvent.size === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noPreorders")}</p>
      ) : (
        <div className="space-y-6">
          {[...byEvent.entries()].map(([slug, g]) => {
            const live = g.rows.filter((r) => r.status !== "cancelled");
            const itemTotals = new Map<string, number>();
            for (const r of live.filter(r => (r.status === "pending" || r.status === "confirmed") &&
              (!(r.is_reservation || r.sponsor_status !== "none") || !!r.participant_id))) {
              for (const i of r.event_preorder_items) itemTotals.set(i.name_snapshot, (itemTotals.get(i.name_snapshot) ?? 0) + i.qty);
            }
            return (
              <div key={slug} className="rounded-xl border">
                <div className="border-b p-4">
                  <h3 className="font-semibold">{g.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {eventDates.get(slug)} · {t("preorderCount", { count: live.length })}
                  </p>
                  {itemTotals.size > 0 && (
                    <p className="mt-2 text-sm">
                      <span className="font-medium">{t("prepList")}: </span>
                      {[...itemTotals.entries()].map(([n, q]) => `${q}× ${n}`).join(" · ")}
                    </p>
                  )}
                </div>
                <ul className="divide-y">
                  {g.rows.map((r) => (
                    <li key={r.id} className={`space-y-2 p-4 ${r.status === "cancelled" ? "opacity-50" : ""}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {r.profiles?.display_name || r.profiles?.username || t("guest")}
                          {r.phone && <span className="ml-2 text-sm font-normal text-muted-foreground">{r.phone}</span>}
                        </span>
                        <span className="text-sm">
                          <span className="font-semibold tabular-nums">{formatVnd(r.total_vnd, locale)}</span> ·{" "}
                          {t(
                            r.status === "pending"
                              ? "statusPending"
                              : r.status === "confirmed"
                                ? "statusConfirmed"
                                : r.status === "fulfilled"
                                  ? "statusFulfilled"
                                  : "statusCancelled",
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {r.event_preorder_items.map((i) => `${i.qty}× ${i.name_snapshot}`).join(", ")}
                      </p>
                      {r.note && <p className="text-sm italic">“{r.note}”</p>}
                      <PreorderStatusButtons id={r.id} status={r.status} eventSlug={slug}
                        readyForPreparation={!(r.is_reservation || r.sponsor_status !== "none") || !!r.participant_id} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
