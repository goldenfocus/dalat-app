"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArrivalContext, ArrivalReceipt } from "@/lib/arrival/types";
import { ArrivalMenu, cartLines, type ArrivalQuantities } from "./arrival-menu";
import { ArrivalOrderView, ArrivalReceiptView } from "./arrival-receipt";
import { StaffDeskEntry } from "./staff-desk-entry";

type PracticeLanguage = "english" | "vietnamese" | "both";
type Level = "starting" | "some" | "comfortable";
const LEVELS: Level[] = ["starting", "some", "comfortable"];

export function GuestArrival({ slug }: { slug: string }) {
  const t = useTranslations("arrival");
  const locale = useLocale();
  const endpoint = `/api/events/${encodeURIComponent(slug)}/arrival?locale=${encodeURIComponent(locale)}`;
  const [context, setContext] = useState<ArrivalContext | null>(null);
  const [receipt, setReceipt] = useState<ArrivalReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [stale, setStale] = useState(false);
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState("");
  const [practiceLanguage, setPracticeLanguage] = useState<PracticeLanguage | null>(null);
  const [englishLevel, setEnglishLevel] = useState<Level | null>(null);
  const [vietnameseLevel, setVietnameseLevel] = useState<Level | null>(null);
  const [quantities, setQuantities] = useState<ArrivalQuantities>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ body: string; id: string } | null>(null);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasReceipt = receipt !== null;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      if (!response.ok) throw new Error("arrival_unavailable");
      const data: ArrivalContext = await response.json();
      if (signal?.aborted) return;
      setContext(data);
      setReceipt(data.receipt);
      setNickname(current => current || data.profile?.name || "");
      setLoadError(false);
      setStale(false);
      return data;
    } catch {
      if (signal?.aborted) return;
      setLoadError(true);
      setStale(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!hasReceipt) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(controller.signal);
    }, 10000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [hasReceipt, refresh]);

  useEffect(() => { if (!loading) heading.current?.focus(); }, [step, loading]);

  const submit = async (withOrder: boolean) => {
    if (submitting.current || !context || !nickname.trim() || !practiceLanguage || !englishLevel || !vietnameseLevel) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const body = JSON.stringify({
      nickname: nickname.trim(), practiceLanguage, englishLevel, vietnameseLevel,
      items: withOrder ? cartLines(context.menu, quantities) : [], note: withOrder ? note.trim() : "",
    });
    if (request.current?.body !== body) request.current = { body, id: crypto.randomUUID() };
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(body), requestId: request.current.id }),
      });
      if (!response.ok) {
        const failure: { error?: string; code?: string } = await response.json().catch(() => ({}));
        const code = failure.code || failure.error || "";
        if (/sold.?out|item_unavailable|invalid_items/.test(code)) {
          setError("errorSoldOut");
          await refresh();
        } else if (/existing_order/.test(code)) {
          const updated = await refresh();
          setError(updated?.priorOrder || updated?.receipt ? null : "errorGeneric");
        } else if (/event_not_open|preorder_disabled/.test(code)) setError("errorClosed");
        else setError("errorGeneric");
        return;
      }
      const result: ArrivalReceipt = await response.json();
      setReceipt(result);
      setStale(false);
    } catch {
      // Keep the same request ID and choices: a lost response must not duplicate an order.
      setError("errorGeneric");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const advance = (event: FormEvent) => { event.preventDefault(); setError(null); setStep(current => current + 1); };
  const menu = context?.event.orderingEnabled ? context.menu : [];
  const selectedItems = context?.priorOrder ? [] : cartLines(menu, quantities);

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-32 pt-5 text-foreground">
      <Link href={`/events/${slug}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("backToEvent")}</Link>
      {context && <StaffDeskEntry slug={slug} />}
      {loading ? <p className="py-16 text-muted-foreground" role="status">{t("loading")}</p> : !context ? (
        <div className="space-y-4 py-12"><p role="alert">{t("loadError")}</p><Button className="scroll-mb-28 min-h-12" onClick={() => void refresh()}>{t("retry")}</Button></div>
      ) : receipt ? <ArrivalReceiptView receipt={receipt} stale={stale} onRefresh={() => void refresh()} /> : !context.event.isOpen ? (
        <div className="space-y-4 py-12"><h1 className="text-2xl font-semibold">{context.event.title}</h1><time dateTime={context.event.startsAt} className="block text-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(context.event.startsAt))}</time><p role="status" className="text-muted-foreground">{t("errorClosed")}</p><Button variant="outline" className="scroll-mb-28 min-h-12" onClick={() => void refresh()}>{t("refresh")}</Button></div>
      ) : (
        <>
          <header className="mb-8 mt-6 border-b border-border pb-6">
            <p className="text-sm font-medium text-primary">{t("welcome")}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight">{context.event.title}</p>
            {context.event.venueName && <p className="mt-1 text-sm text-muted-foreground">{context.event.venueName}</p>}
          </header>
          <p className="mb-3 text-sm text-muted-foreground">{t("step", { current: step + 1, total: 3 })}</p>
          <h1 ref={heading} tabIndex={-1} className="mb-6 text-3xl font-semibold tracking-tight outline-none">{t(step === 0 ? "nameTitle" : step === 1 ? "languageTitle" : "menuTitle")}</h1>
          {step === 0 && (
            <form onSubmit={advance} className="space-y-6">
              <label className="block space-y-2"><span className="text-sm font-medium">{t("nickname")}</span><Input required maxLength={80} autoComplete="nickname" value={nickname} onChange={event => setNickname(event.target.value)} className="scroll-mb-28 min-h-12 text-base" /></label>
              <p className="text-sm text-muted-foreground">{t("nameHint")}</p>
              <Button type="submit" disabled={!nickname.trim()} className="scroll-mb-28 min-h-12 w-full text-base">{t("continue")}</Button>
            </form>
          )}
          {step === 1 && (
            <form onSubmit={advance} className="space-y-7">
              <fieldset className="grid grid-cols-3 gap-2"><legend className="sr-only">{t("languageTitle")}</legend>{(["english", "vietnamese", "both"] as const).map(language => <Button key={language} type="button" variant={practiceLanguage === language ? "secondary" : "outline"} aria-pressed={practiceLanguage === language} className="scroll-mb-28 min-h-12 px-2" onClick={() => setPracticeLanguage(language)}>{t(language)}</Button>)}</fieldset>
              {([{ label: "englishLevel", value: englishLevel, change: setEnglishLevel }, { label: "vietnameseLevel", value: vietnameseLevel, change: setVietnameseLevel }] as const).map(group => (
                <fieldset key={group.label}><legend className="mb-2 text-lg font-medium">{t(group.label)}</legend><div className="divide-y divide-border border-y border-border">{LEVELS.map(level => <button key={level} type="button" aria-pressed={group.value === level} onClick={() => group.change(level)} className={`scroll-mb-28 flex min-h-14 w-full items-center px-3 text-left text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${group.value === level ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>{t(level)}</button>)}</div></fieldset>
              ))}
              <Button type="submit" disabled={!practiceLanguage || !englishLevel || !vietnameseLevel} className="scroll-mb-28 min-h-12 w-full text-base">{t("continue")}</Button>
            </form>
          )}
          {step === 2 && (
            <div className="space-y-6">
              {context.priorOrder ? <ArrivalOrderView order={context.priorOrder} /> : <>
                <p className="text-muted-foreground">{t("menuHint")}</p>
                <ArrivalMenu sections={menu} quantities={quantities} onChange={setQuantities} note={note} onNoteChange={setNote} disabled={busy} />
              </>}
              {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
              <Button type="button" loading={busy} disabled={busy} className="scroll-mb-28 min-h-12 w-full whitespace-normal text-base" onClick={() => void submit(selectedItems.length > 0)}>{t(busy ? "submitting" : selectedItems.length > 0 ? "checkInAndOrder" : "checkIn")}</Button>
              {!context.priorOrder && menu.length > 0 && <Button type="button" variant="ghost" disabled={busy} className="scroll-mb-28 min-h-12 w-full" onClick={() => void submit(false)}>{t("orderWithStaff")}</Button>}
            </div>
          )}
          {step > 0 && <Button type="button" variant="ghost" disabled={busy} className="mt-5 min-h-11" onClick={() => { setStep(current => current - 1); setError(null); }}><ArrowLeft aria-hidden="true" />{t("back")}</Button>}
          {loadError && <p className="mt-4 text-sm text-muted-foreground" role="status">{t("refreshFailed")}</p>}
        </>
      )}
    </div>
  );
}
