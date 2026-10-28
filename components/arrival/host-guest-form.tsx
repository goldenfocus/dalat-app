"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LANGUAGE_LEVELS } from "@/lib/arrival/languages";
import { formatVnd } from "@/lib/menu/format";
import { ArrivalMenu, cartLines } from "./arrival-menu";
import type { HostData, HostParticipant, HostRsvp, LanguageLevel, PracticeLanguage } from "./host-types";

export function HostGuestForm({ data, slug, participant, rsvp, onCancel, onSaved }: { data: HostData; slug: string; participant?: HostParticipant; rsvp?: HostRsvp; onCancel: () => void; onSaved: () => Promise<void> }) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  const submitting = useRef(false);
  const existingOrder = data.orders.find(order => ["pending", "confirmed"].includes(order.status) && ((participant && order.participant_id === participant.id) || ((participant?.user_id || rsvp?.user_id) && order.user_id === (participant?.user_id || rsvp?.user_id))));
  const viewOnly = Boolean(existingOrder && (participant || rsvp?.checked_in_at));
  const [nickname, setNickname] = useState(participant?.nickname || rsvp?.displayName || rsvp?.username || "");
  const [practiceLanguage, setPracticeLanguage] = useState<PracticeLanguage | "">(participant?.practice_language || rsvp?.preferences?.practiceLanguage || "");
  const [englishLevel, setEnglishLevel] = useState<LanguageLevel | "">(participant?.english_level || rsvp?.preferences?.englishLevel || "");
  const [vietnameseLevel, setVietnameseLevel] = useState<LanguageLevel | "">(participant?.vietnamese_level || rsvp?.preferences?.vietnameseLevel || "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const payload = { nickname: nickname.trim(), practiceLanguage, englishLevel, vietnameseLevel, items: !existingOrder && data.access.canOrder && data.event.orderingEnabled ? cartLines(data.menu, quantities) : [], note: note.trim(), staffEntry: true, ...(participant ? { participantId: participant.id } : rsvp ? { userId: rsvp.user_id } : {}) };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/arrival`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId: request.current.id }) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { code?: string };
        setError(t(result.code === "item_unavailable" ? "errorSoldOut" : ["existing_order", "status_conflict", "request_conflict"].includes(result.code || "") ? "hostConflict" : ["event_not_open_for_arrival", "event_not_open_for_preorder"].includes(result.code || "") ? "errorClosed" : "errorGeneric"));
        return;
      }
      request.current = null;
      await onSaved();
    } catch { setError(t("errorGeneric")); }
    finally { submitting.current = false; setBusy(false); }
  };
  const levelSelect = (id: string, value: LanguageLevel | "", setValue: (next: LanguageLevel | "") => void, label: string) => <label className="block space-y-2" htmlFor={id}><span className="text-sm font-medium">{label}</span><select id={id} required value={value} onChange={event => setValue(event.target.value as LanguageLevel | "")} className="min-h-12 w-full rounded-lg border bg-background px-3"><option value="" disabled>{t("hostChoose")}</option>{LANGUAGE_LEVELS.map(level => <option key={level} value={level}>{t(`level_${level}`)}</option>)}</select></label>;
  return <form onSubmit={submit} className="space-y-5 rounded-lg border bg-card p-4">
    <h2 className="text-xl font-semibold">{t(existingOrder ? "hostViewOrder" : participant ? "hostAddOrder" : "hostGuestCheckIn")}</h2>
    {viewOnly && <p className="font-medium">{participant?.nickname || rsvp?.displayName || rsvp?.username}</p>}
    {!viewOnly && <>
    <label className="block space-y-2" htmlFor="guest-name"><span className="text-sm font-medium">{t("nickname")}</span><input id="guest-name" required maxLength={80} autoComplete="off" value={nickname} onChange={event => setNickname(event.target.value)} className="min-h-12 w-full rounded-lg border bg-background px-3" /></label>
    <label className="block space-y-2" htmlFor="guest-practice"><span className="text-sm font-medium">{t("languageTitle")}</span><select id="guest-practice" required value={practiceLanguage} onChange={event => setPracticeLanguage(event.target.value as PracticeLanguage)} className="min-h-12 w-full rounded-lg border bg-background px-3"><option value="" disabled>{t("hostChoose")}</option><option value="english">{t("english")}</option><option value="vietnamese">{t("vietnamese")}</option><option value="both">{t("both")}</option></select></label>
    <div className="grid gap-4 sm:grid-cols-2">{levelSelect("guest-english", englishLevel, setEnglishLevel, t("englishLevel"))}{levelSelect("guest-vietnamese", vietnameseLevel, setVietnameseLevel, t("vietnameseLevel"))}</div>
    </>}
    {existingOrder && <section className="space-y-2 border-y py-4"><h3 className="font-semibold">{t("orderTitle")}</h3><p className="text-sm text-muted-foreground">{t(existingOrder.status === "confirmed" ? "orderConfirmed" : "orderPending")}</p><ul>{existingOrder.items.map((item, index) => <li key={index}>{item.qty}× {item.name_snapshot}</li>)}</ul>{existingOrder.note && <p className="text-sm">{existingOrder.note}</p>}<p className="font-semibold">{formatVnd(existingOrder.total_vnd, locale)}</p></section>}
    {!existingOrder && data.access.canOrder && data.event.orderingEnabled && <div className="border-t pt-4"><h3 className="mb-4 font-semibold">{t("menuTitle")}</h3><ArrivalMenu sections={data.menu} quantities={quantities} onChange={setQuantities} note={note} onNoteChange={setNote} disabled={busy} /></div>}
    {error && <p role="alert" className="border-l-2 border-destructive pl-3 text-sm">{error}</p>}
    <div className="flex flex-col gap-2 sm:flex-row">{!viewOnly && <button disabled={busy || !nickname.trim() || Boolean(participant && !Object.values(quantities).some(Boolean))} className="min-h-12 flex-1 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">{t(busy ? "hostSaving" : Object.values(quantities).some(Boolean) ? "hostSaveAndOrder" : "checkIn")}</button>}<button type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-lg border px-5">{t(viewOnly ? "back" : "hostCancel")}</button></div>
  </form>;
}
