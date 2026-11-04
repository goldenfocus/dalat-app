"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { HostData, HostRsvp } from "./host-types";

type Account = HostRsvp & { avatarUrl?: string | null };
type SearchResult = { query: string; accounts: Account[]; error: boolean };

export function HostAccountSearch({ query, slug, data, onSelect }: { query: string; slug: string; data: HostData; onSelect: (account: HostRsvp) => void }) {
  const t = useTranslations("arrival");
  const term = query.trim();
  const [result, setResult] = useState<SearchResult | null>(null);
  useEffect(() => {
    if (term.replace(/^@/, "").length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(slug)}/arrival/search`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: term }), signal: controller.signal,
        });
        if (!response.ok) throw new Error("search_failed");
        const body = await response.json() as { accounts: Account[] };
        if (!controller.signal.aborted) setResult({ query: term, accounts: body.accounts, error: false });
      } catch {
        if (!controller.signal.aborted) setResult({ query: term, accounts: [], error: true });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, slug]);
  if (term.replace(/^@/, "").length < 2) return null;
  const current = result?.query === term ? result : null;
  return <div aria-busy={!current}>
    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t("hostMatchingAccounts")}</h3>
    {!current ? <p role="status" className="py-3 text-sm text-muted-foreground">{t("hostSearching")}</p>
      : current.error ? <p role="alert" className="py-3 text-sm">{t("hostSearchFailed")}</p>
      : !current.accounts.length ? <p role="status" className="py-3 text-sm text-muted-foreground">{t("hostNoAccounts")}</p>
      : <ul className="divide-y border-y">{current.accounts.map(account => {
        const rsvp = data.rsvps.find(person => person.user_id === account.user_id);
        const arrived = data.participants.some(person => person.user_id === account.user_id) || !!rsvp?.checked_in_at;
        return <li key={account.user_id} className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {account.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={account.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            )}
            <div className="min-w-0"><p className="truncate font-medium">{account.displayName || account.username || t("hostGuest")}</p>{account.username && <p className="truncate text-sm text-muted-foreground">@{account.username}</p>}</div>
          </div>
          {arrived ? <span className="flex shrink-0 items-center gap-1 text-sm"><Check aria-hidden className="h-4 w-4" />{t("hostAlreadyHere")}</span>
            : <button type="button" onClick={() => onSelect(rsvp || account)} className="min-h-12 shrink-0 rounded-lg border px-4 font-medium">{t("checkIn")}</button>}
        </li>;
      })}</ul>}
  </div>;
}
