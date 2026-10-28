"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, Plus, Search } from "lucide-react";
import { HostGuestForm } from "./host-guest-form";
import type { HostData, HostParticipant, HostRsvp } from "./host-types";

type Selection = { participant?: HostParticipant; rsvp?: HostRsvp } | null;
export function HostArrivals({ data, slug, guestPath, busy, onSaved }: { data: HostData; slug: string; guestPath: string; busy: boolean; onSaved: () => Promise<void> }) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const matches = (name: string) => normalize(name).includes(normalize(search.trim().replace(/^@/, "")));
  const checkedUserIds = new Set(data.participants.map(person => person.user_id).filter(Boolean));
  const legacyArrivals = data.rsvps.filter(person => person.checked_in_at && !checkedUserIds.has(person.user_id));
  const activeOrder = (participantId?: string, userId?: string | null) => data.orders.find(order => ["pending", "confirmed"].includes(order.status) && ((participantId && order.participant_id === participantId) || (userId && order.user_id === userId)));
  const waiting = data.rsvps.filter(person => !checkedUserIds.has(person.user_id) && !person.checked_in_at && matches(`${person.displayName || ""} ${person.username || ""}`));
  const arrived = data.participants.filter(person => matches(person.nickname));
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
    {selection !== null ? <HostGuestForm key={selection.participant?.id || selection.rsvp?.id || "walkin"} data={data} slug={slug} participant={selection.participant} rsvp={selection.rsvp} onCancel={() => setSelection(null)} onSaved={async () => { setSelection(null); await onSaved(); }} /> : <>
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{t("hostCheckedCount", { count: data.participants.length + legacyArrivals.length })}</h2><button type="button" disabled={busy} onClick={() => setSelection({})} className="flex min-h-12 items-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground"><Plus aria-hidden className="h-4 w-4" />{t("hostWalkIn")}</button></div>
      <label className="relative block"><span className="sr-only">{t("hostSearch")}</span><Search aria-hidden className="absolute left-3 top-4 h-5 w-5 text-muted-foreground" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("hostSearch")} className="min-h-14 w-full rounded-lg border bg-background pl-11 pr-3" /></label>
      <div><h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t("hostExpected")}</h3>{!waiting.length && <p className="py-4 text-sm text-muted-foreground">{t(search ? "hostNoMatches" : "hostNoExpected")}</p>}<ul className="divide-y border-y">{waiting.map(person => <li key={person.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-medium">{person.displayName || person.username || t("hostGuest")}</p>{person.username && <p className="truncate text-sm text-muted-foreground">@{person.username}</p>}</div><button type="button" onClick={() => setSelection({ rsvp: person })} className="min-h-12 shrink-0 rounded-lg border px-4 font-medium">{t("checkIn")}</button></li>)}</ul></div>
      <div><h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t("hostAlreadyHere")}</h3>{!arrived.length && !legacyArrivals.some(person => matches(`${person.displayName} ${person.username || ""}`)) && <p className="py-4 text-sm text-muted-foreground">{t(search ? "hostNoMatches" : "hostNoArrivals")}</p>}<ul className="divide-y border-y">{arrived.map(person => <li key={person.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-medium">{person.nickname}</p><p className="font-mono text-xs text-muted-foreground">{person.id.slice(0, 8).toUpperCase()}</p>{person.practice_language && <p className="text-sm text-muted-foreground">{t(person.practice_language)}</p>}</div>{data.access.canOrder && <button type="button" onClick={() => setSelection({ participant: person })} className="min-h-12 shrink-0 rounded-lg border px-4 text-sm">{t(activeOrder(person.id, person.user_id) ? "hostViewOrder" : "hostAddOrder")}</button>}</li>)}{legacyArrivals.filter(person => matches(`${person.displayName} ${person.username || ""}`)).map(person => <li key={`legacy-${person.id}`} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate font-medium">{person.displayName || person.username || t("hostGuest")}</p>{person.username && <p className="text-sm text-muted-foreground">@{person.username}</p>}</div>{data.access.canOrder && <button type="button" onClick={() => setSelection({ rsvp: person })} className="min-h-12 shrink-0 rounded-lg border px-4 text-sm">{t(activeOrder(undefined, person.user_id) ? "hostViewOrder" : "hostAddOrder")}</button>}</li>)}</ul></div>
    </>}
  </section>;
}
