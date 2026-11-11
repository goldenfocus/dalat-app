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
import { SaveAccountCard } from "./save-account-card";
import { StaffDeskEntry } from "./staff-desk-entry";
import { EventPractice } from "@/components/practice/event-practice";
import { QuickLanguage, quickLanguageChoices, type QuickSpeaks } from "./quick-language";
import { completeLanguageChoices, emptyLanguageChoices, type LanguageChoices } from "@/lib/arrival/legacy-languages";

import { LanguageSetup } from "./language-setup";
import { DEFAULT_LANGUAGE_PREFERENCES, languagePreferencesSchema, type LanguagePreferences } from "@/lib/arrival/languages";
import { legacyLanguageChoices } from "@/lib/arrival/language-compat";
import { SponsoredCart, sponsoredItemId } from "./sponsored-cart";
import { DrinkMenuSheet, reservationQuantities } from "./drink-menu-sheet";
import { ExistingDrinkOffer } from "./existing-drink-offer";

/** The door QR adds a key that proves the guest is at the venue. Never read it during render. */
function doorKeyFromUrl() {
  const value = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("door");
  return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

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
  const [preferences, setPreferences] = useState<LanguagePreferences>(DEFAULT_LANGUAGE_PREFERENCES);
  const [showDrinkMenu, setShowDrinkMenu] = useState(true);
  const [selectedSponsored, setSelectedSponsored] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [languages, setLanguages] = useState<LanguageChoices>(emptyLanguageChoices);
  const [speaks, setSpeaks] = useState<QuickSpeaks | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
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
      if (!initialized.current) {
        initialized.current = true;
        // Someone who registered earlier and now scans the door QR confirms they
        // are present. Best effort: the receipt stays usable if this fails.
        const doorKey = data.receipt ? doorKeyFromUrl() : null;
        if (doorKey) void fetch(`/api/events/${encodeURIComponent(slug)}/arrival/door`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doorKey }),
        }).catch(() => undefined);
        if (data.preferences) {
          setLanguages(data.preferences);
          if (data.profile?.name?.trim()) setStep(1);
        }
        if (data.profile) {
          const savedResponse = await fetch("/api/arrival/languages", { cache: "no-store", signal });
          if (savedResponse.ok) {
            const saved: { preferences: LanguagePreferences | null } = await savedResponse.json();
            if (signal?.aborted) return;
            if (saved.preferences) {
              setPreferences(saved.preferences);
              setLanguages(legacyLanguageChoices(saved.preferences));
              if (data.profile.name?.trim()) setStep(1);
            }
          }
        }
      }
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
  }, [endpoint, slug]);

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

  useEffect(() => { if (!loading) (nameInput.current ?? heading.current)?.focus(); }, [step, loading]);

  const submit = async (withOrder: boolean, fromDrinkSheet = false) => {
    // A walk-in answers one question; an account reuses its saved language profile.
    const choices = context?.profile ? languages : speaks ? quickLanguageChoices(speaks) : emptyLanguageChoices;
    if (submitting.current || !context || !nickname.trim() || !completeLanguageChoices(choices)) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const orderQuantities = fromDrinkSheet && context.sponsorEligibility?.eligible ? reservationQuantities(quantities, selectedSponsored) : quantities;
    const doorKey = doorKeyFromUrl();
    const body = JSON.stringify({
      nickname: nickname.trim(), ...choices, ...(doorKey ? { doorKey } : {}),
      sponsoredItemId: withOrder && context.profile && context.rsvpStatus === "going" && context.sponsorEligibility?.eligible === true ? sponsoredItemId(context.menu, orderQuantities, context.event.sponsorship?.eligibleItemIds || [], selectedSponsored) || undefined : undefined,
      items: withOrder ? cartLines(context.menu, orderQuantities) : [], note: withOrder ? note.trim() : "",
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

  const menu = context?.event.orderingEnabled ? context.menu : [];
  const selectedItems = context?.priorOrder ? [] : cartLines(menu, quantities);

  const advance = async (event: FormEvent) => {
    event.preventDefault();
    if (!context?.profile) { void submit(selectedItems.length > 0); return; }
    if (!nickname.trim() || !languagePreferencesSchema.safeParse(preferences).success) return;
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/arrival/languages", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences),
      });
      if (!response.ok) throw new Error("preferences_failed");
      setLanguages(legacyLanguageChoices(preferences));
    } catch { setError("errorGeneric"); return; }
    finally { setBusy(false); }
    setStep(1);
  };

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-24 pt-3 text-foreground">
      <Link href={`/events/${slug}`} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("backToEvent")}</Link>
      {context && <StaffDeskEntry slug={slug} />}
      {receipt && /^language-exchange-social-house-z8oc-\d{8}$/.test(slug) && <EventPractice slug={slug} />}
      {loading ? <p className="py-16 text-muted-foreground" role="status">{t("loading")}</p> : !context ? (
        <div className="space-y-4 py-12"><p role="alert">{t("loadError")}</p><Button className="scroll-mb-28 min-h-12" onClick={() => void refresh()}>{t("retry")}</Button></div>
      ) : receipt ? <><ArrivalReceiptView receipt={receipt} stale={stale} onRefresh={() => void refresh()} />{!receipt.participant.user_id && <SaveAccountCard />}</> : !context.event.isOpen ? (
        <div className="space-y-4 py-12"><h1 className="text-2xl font-semibold">{context.event.title}</h1><time dateTime={context.event.startsAt} className="block text-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(context.event.startsAt))}</time><p role="status" className="text-muted-foreground">{t("errorClosed")}</p><Button variant="outline" className="scroll-mb-28 min-h-12" onClick={() => void refresh()}>{t("refresh")}</Button></div>
      ) : (
        <>
          <header className="mb-5 mt-3">
            <p className="text-sm text-muted-foreground">{context.event.title}</p>
          </header>
          <h1 ref={heading} tabIndex={-1} className="mb-5 text-2xl font-semibold tracking-tight outline-none">{t(context.profile && step === 0 ? "languageTitle" : "checkIn")}</h1>
          {!context.profile && (
            <form onSubmit={advance} className="space-y-5">
              <label className="block space-y-2"><span className="text-sm font-medium">{t("nickname")}</span><Input ref={nameInput} required maxLength={80} autoComplete="nickname" enterKeyHint="done" value={nickname} onChange={event => setNickname(event.target.value)} className="min-h-12 text-base md:text-base" /></label>
              <QuickLanguage value={speaks} onChange={setSpeaks} disabled={busy} />
              {/* Ordering is optional and never stands between a guest and their check-in. */}
              {menu.length > 0 && <details className="rounded-lg border border-border p-3">
                <summary className="flex min-h-11 cursor-pointer items-center font-medium">{t("registration.chooseFromMenu")}</summary>
                <p className="mb-4 mt-2 text-sm text-muted-foreground">{t("menuHint")}</p>
                <ArrivalMenu sections={menu} quantities={quantities} onChange={setQuantities} note={note} onNoteChange={setNote} disabled={busy} />
              </details>}
              {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
              <Button type="submit" loading={busy} disabled={busy || !nickname.trim() || !speaks} className="scroll-mb-28 min-h-12 w-full whitespace-normal text-base">{t(busy ? "submitting" : selectedItems.length > 0 ? "checkInAndOrder" : "checkIn")}</Button>
            </form>
          )}
          {context.profile && step === 0 && (
            <form onSubmit={advance} className="space-y-5">
              {!context.profile.name && <label className="block space-y-2"><span className="text-sm font-medium">{t("nickname")}</span><Input required maxLength={80} autoComplete="nickname" value={nickname} onChange={event => setNickname(event.target.value)} className="min-h-12 text-base" /></label>}
              <LanguageSetup value={preferences} onChange={setPreferences} disabled={busy} />
              {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
              <Button type="submit" loading={busy} disabled={busy || !nickname.trim() || !languagePreferencesSchema.safeParse(preferences).success} className="min-h-12 w-full text-base">{t("continue")}</Button>
            </form>
          )}
          {context.profile && step === 1 && (
            <div className="space-y-6">
              {context.profile && context.rsvpStatus === "going" && !context.priorOrder && menu.length > 0 && <DrinkMenuSheet context={context} open={showDrinkMenu} onLater={() => setShowDrinkMenu(false)} busy={busy} failed={!!error} quantities={quantities} onChange={setQuantities} selected={selectedSponsored} onSelect={setSelectedSponsored} note={note} onNoteChange={setNote} onReserve={() => void submit(true, true)} confirmLabel={t("checkInAndOrder")} />}
              {context.priorOrder ? <><ArrivalOrderView order={context.priorOrder} />{context.rsvpStatus === "going" && <ExistingDrinkOffer eligible={context.sponsorEligibility?.eligible} event={context.event} order={context.priorOrder} onClaimed={order => setContext({ ...context, priorOrder: order })} />}</> : menu.length > 0 && <details className="rounded-lg border border-border p-3">
                <summary className="flex min-h-11 cursor-pointer items-center font-medium">{t(context.sponsorEligibility?.eligible ? "registration.chooseFreeDrink" : "registration.chooseFromMenu")}</summary>
                <p className="mb-4 mt-2 text-sm text-muted-foreground">{t("menuHint")}</p>
                <ArrivalMenu sections={menu} quantities={quantities} onChange={setQuantities} note={note} onNoteChange={setNote} disabled={busy} />
                {context.event.sponsorship && context.profile && context.rsvpStatus === "going" && context.sponsorEligibility?.eligible === true && <SponsoredCart sections={menu} quantities={quantities} eligible={context.event.sponsorship.eligibleItemIds} selected={selectedSponsored} onSelect={setSelectedSponsored} />}
              </details>}
              {error && <p className="text-sm text-destructive" role="alert">{t(error)}</p>}
              <Button type="button" loading={busy} disabled={busy} className="scroll-mb-28 min-h-12 w-full whitespace-normal text-base" onClick={() => void submit(selectedItems.length > 0)}>{t(busy ? "submitting" : selectedItems.length > 0 ? "checkInAndOrder" : "checkIn")}</Button>
              {!context.priorOrder && menu.length > 0 && <Button type="button" variant="ghost" disabled={busy} className="scroll-mb-28 min-h-12 w-full" onClick={() => void submit(false)}>{t("orderWithStaff")}</Button>}
            </div>
          )}
          {context.profile && step > 0 && <Button type="button" variant="ghost" disabled={busy} className="mt-5 min-h-11" onClick={() => { setStep(current => current - 1); setError(null); }}><ArrowLeft aria-hidden="true" />{t("editLanguages")}</Button>}
          {loadError && <p className="mt-4 text-sm text-muted-foreground" role="status">{t("refreshFailed")}</p>}
        </>
      )}
    </div>
  );
}
