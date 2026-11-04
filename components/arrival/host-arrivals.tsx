"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, Plus, Search } from "lucide-react";
import { HostAccountSearch } from "./host-account-search";
import { HostGuestForm } from "./host-guest-form";
import { LanguageSummary } from "./language-summary";
import { legacyLanguageChoices } from "@/lib/arrival/language-compat";
import { completeLanguageChoices } from "@/lib/arrival/legacy-languages";
import type { HostData, HostParticipant, HostRsvp } from "./host-types";

type Selection = { participant?: HostParticipant; rsvp?: HostRsvp; orderMode?: boolean } | null;
export function HostArrivals({ data, slug, guestPath, busy, onSaved }: { data: HostData; slug: string; guestPath: string; busy: boolean; onSaved: () => Promise<void> }) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const checking = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const matches = (name: string) => normalize(name).includes(normalize(search.trim().replace(/^@/, "")));
  const checkedUserIds = new Set(data.participants.map(person => person.user_id).filter(Boolean));
  const legacyArrivals = data.rsvps.filter(person => person.checked_in_at && !checkedUserIds.has(person.user_id));
  const activeOrder = (participantId?: string, userId?: string | null) => data.orders.find(order => ["pending", "confirmed"].includes(order.status) && ((participantId && order.participant_id === participantId) || (userId && order.user_id === userId)));
  const waiting = data.rsvps.filter(person => !checkedUserIds.has(person.user_id) && !person.checked_in_at && matches(`${person.displayName || ""} ${person.username || ""}`));
  const arrived = data.participants.filter(person => matches(person.nickname));
  const orderSummary = (participantId?: string, userId?: string | null) => {
    const order = activeOrder(participantId, userId);
    return order ? <p className="mt-1 text-sm text-muted-foreground">{t("orderTitle")}: {order.items.map(item => `${item.qty} × ${item.name_snapshot}`).join(", ")}</p> : null;
  };
  const checkIn = async (person: HostRsvp) => {
    if (checking.current || busy) return;
    const preferences = person.languagePreferences ? legacyLanguageChoices(person.languagePreferences) : person.preferences;
    const nickname = person.displayName || person.username || "";
    if (!nickname.trim() || !preferences || !completeLanguageChoices(preferences)) {
      setSelection({ rsvp: person });
      return;
    }
    const payload = { userId: person.user_id, nickname, ...preferences, staffEntry: true, items: [], note: "" };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    checking.current = true;
    setCheckingId(person.id); setCheckInError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/arrival`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId: request.current.id }) });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as { code?: string };
        setCheckInError(t(failure.code === "event_full" ? "hostEventFull" : ["status_conflict", "request_conflict"].includes(failure.code || "") ? "hostConflict" : "errorGeneric"));
        return;
      }
      request.current = null;
      await onSaved();
    } catch { setCheckInError(t("errorGeneric")); }
    finally { checking.current = false; setCheckingId(null); }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${guestPath}`);
      setCopied(true); setCopyError(false);
    } catch { setCopyError(true); }
  };
  return <section className="space-y-6">
    <details className="rounded-lg border bg-card p-4">
      <summary className="min-h-11 cursor-pointer font-medium">{t("hostGuestLink")}</summary>
      <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        {/* The QR endpoint encodes only the public arrival URL, never host access. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/events/${encodeURIComponent(slug)}/arrival/qr?locale=${encodeURIComponent(locale)}`} alt={t("hostQrAlt")} width={176} height={176} className="h-44 w-44 bg-white p-2" />
        <div className="min-w-0"><a href={guestPath} target="_blank" rel="noreferrer" className="break-all text-sm underline underline-offset-4">{guestPath}</a><button type="button" onClick={() => void copy()} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm">{copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}{t(copied ? "hostCopied" : "hostCopyLink")}</button>{copyError && <p role="alert" className="mt-2 text-sm">{t("hostCopyFailed")}</p>}</div>
      </div>
    </details>
    {selection !== null ? <HostGuestForm key={selection.participant?.id || selection.rsvp?.id || "walkin"} data={data} slug={slug} participant={selection.participant} rsvp={selection.rsvp} orderMode={selection.orderMode} onCancel={() => setSelection(null)} onSaved={async () => { setSelection(null); await onSaved(); }} /> : <>
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{t("hostCheckedCount", { count: data.participants.length + legacyArrivals.length })}</h2><button type="button" disabled={busy || checkingId !== null} onClick={() => setSelection({})} className="flex min-h-12 items-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground"><Plus aria-hidden className="h-4 w-4" />{t("hostWalkIn")}</button></div>
      <label className="relative block"><span className="sr-only">{t("hostAccountSearch")}</span><Search aria-hidden className="absolute left-3 top-4 h-5 w-5 text-muted-foreground" /><input type="search" maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} value={search} onChange={event => setSearch(event.target.value)} placeholder={t("hostAccountSearch")} className="min-h-14 w-full rounded-lg border bg-background pl-11 pr-3" /></label>
      <HostAccountSearch query={search} slug={slug} data={data} onSelect={account => { void checkIn(account); }} />
      {checkInError && <p role="alert" className="text-sm text-destructive">{checkInError}</p>}
      <div><h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t("hostExpected")}</h3>{!waiting.length && <p className="py-4 text-sm text-muted-foreground">{t(search ? "hostNoMatches" : "hostNoExpected")}</p>}<ul className="divide-y border-y">{waiting.map(person => <li key={person.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-medium">{person.displayName || person.username || t("hostGuest")}</p>{person.username && <p className="truncate text-sm text-muted-foreground">@{person.username}</p>}{orderSummary(undefined, person.user_id)}</div><button type="button" disabled={busy || checkingId !== null} onClick={() => { void checkIn(person); }} className="min-h-12 shrink-0 rounded-lg border px-4 font-medium">{t(checkingId === person.id ? "hostSaving" : "checkIn")}</button></li>)}</ul></div>
      <div><h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t("hostAlreadyHere")}</h3>{!arrived.length && !legacyArrivals.some(person => matches(`${person.displayName} ${person.username || ""}`)) && <p className="py-4 text-sm text-muted-foreground">{t(search ? "hostNoMatches" : "hostNoArrivals")}</p>}<ul className="divide-y border-y">{arrived.map(person => <li key={person.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-medium">{person.nickname}</p><p className="font-mono text-xs text-muted-foreground">{person.id.slice(0, 8).toUpperCase()}</p>{person.language_preferences ? <LanguageSummary value={person.language_preferences} /> : person.practice_language && <p className="text-sm text-muted-foreground">{t(person.practice_language)}</p>}{orderSummary(person.id, person.user_id)}</div>{data.access.canOrder && <button type="button" onClick={() => setSelection({ participant: person, orderMode: true })} className="min-h-12 shrink-0 rounded-lg border px-4 text-sm">{t(activeOrder(person.id, person.user_id) ? "hostViewOrder" : "hostAddOrder")}</button>}</li>)}{legacyArrivals.filter(person => matches(`${person.displayName} ${person.username || ""}`)).map(person => <li key={`legacy-${person.id}`} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-medium">{person.displayName || person.username || t("hostGuest")}</p>{person.username && <p className="text-sm text-muted-foreground">@{person.username}</p>}</div>{data.access.canOrder && <button type="button" onClick={() => setSelection({ rsvp: person, orderMode: true })} className="min-h-12 shrink-0 rounded-lg border px-4 text-sm">{t(activeOrder(undefined, person.user_id) ? "hostViewOrder" : "hostAddOrder")}</button>}</li>)}</ul></div>
    </>}
  </section>;
}
