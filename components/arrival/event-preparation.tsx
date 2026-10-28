"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { ArrowLeft, Check } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { useViewer } from "@/lib/hooks/use-viewer";
import { Button } from "@/components/ui/button";
import { LanguageSetup } from "./language-setup";
import { DEFAULT_LANGUAGE_PREFERENCES, languagePreferencesSchema, type LanguagePreferences } from "@/lib/arrival/languages";
import type { ArrivalContext, ArrivalOrder } from "@/lib/arrival/types";
import { cartLines, type ArrivalQuantities } from "./arrival-menu";
import { ArrivalOrderView } from "./arrival-receipt";
import { DrinkMenuSheet, canChooseFreeDrink, reservationQuantities } from "./drink-menu-sheet";
import { ExistingDrinkOffer } from "./existing-drink-offer";

type PreparationContext = ArrivalContext & { rsvpStatus?: string | null };
export function EventPreparation({ slug }: { slug: string }) {
  const t = useTranslations("arrival.registration");
  const common = useTranslations("arrival");
  const locale = useLocale();
  const { profile } = useViewer();
  const [context, setContext] = useState<PreparationContext | null>(null);
  const [preferences, setPreferences] = useState<LanguagePreferences>(DEFAULT_LANGUAGE_PREFERENCES);
  const [step, setStep] = useState<"languages" | "menu" | "done">("languages");
  const [order, setOrder] = useState<ArrivalOrder | null>(null);
  const [quantities, setQuantities] = useState<ArrivalQuantities>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const pending = useRef<{ body: string; id: string } | null>(null);
  const endpoint = `/api/events/${encodeURIComponent(slug)}/arrival`;

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`${endpoint}?locale=${locale}`, { cache: "no-store", signal: controller.signal }).then(async response => { if (!response.ok) throw new Error("load"); return response.json() as Promise<PreparationContext>; }),
      fetch("/api/arrival/languages", { cache: "no-store", signal: controller.signal }).then(async response => { if (!response.ok) throw new Error("load"); return response.json() as Promise<{ preferences: LanguagePreferences | null }>; }),
    ]).then(([data, saved]) => {
      if (controller.signal.aborted) return;
      setContext(data); setOrder(data.receipt?.order || data.priorOrder || null);
      if (saved.preferences) {
        setPreferences(saved.preferences);
        setStep(data.receipt?.order || data.priorOrder ? "done" : "menu");
      }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, locale]);

  const saveLanguages = async () => {
    if (lock.current || !languagePreferencesSchema.safeParse(preferences).success) return;
    lock.current = true; setBusy(true); setFailed(false);
    try {
      const response = await fetch("/api/arrival/languages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) });
      if (!response.ok) throw new Error("save");
      setStep(order ? "done" : "menu");
    } catch { setFailed(true); }
    finally { setBusy(false); lock.current = false; }
  };
  const reserve = async () => {
    if (lock.current || !context) return;
    lock.current = true; setBusy(true); setFailed(false);
    const freeDrink = canChooseFreeDrink(context) ? selected : null;
    const body = JSON.stringify({ items: cartLines(context.menu, reservationQuantities(quantities, freeDrink)), note, sponsoredItemId: freeDrink || undefined });
    if (pending.current?.body !== body) pending.current = { body, id: crypto.randomUUID() };
    try {
      const response = await fetch(`${endpoint}/reserve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body), requestId: pending.current.id }) });
      if (!response.ok) throw new Error("reserve");
      const data: { order: ArrivalOrder } = await response.json(); setOrder(data.order); setStep("done");
    } catch { setFailed(true); }
    finally { lock.current = false; setBusy(false); }
  };

  return <main className="mx-auto max-w-xl px-4 pb-32 pt-5">
    <Link href={`/events/${slug}`} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" aria-hidden />{common("backToEvent")}</Link>
    <h1 className="text-3xl font-semibold tracking-tight">{t("prepare")}</h1>
    {context && <p className="mt-2 text-muted-foreground">{context.event.title}</p>}
    {loading ? <p className="py-8" role="status">{common("loading")}</p> : !context ? <p className="py-8" role="alert">{common("loadError")}</p> : context.rsvpStatus !== "going" ? <section className="mt-8 space-y-4"><p>{t("rsvpFirst")}</p><Button asChild><Link href={`/events/${slug}`}>{common("backToEvent")}</Link></Button></section> : <>
      <div className="my-6 flex items-center gap-3 border-y py-4">
        {profile?.avatar_url && <Image src={profile.avatar_url} alt="" width={48} height={48} className="h-12 w-12 rounded-lg object-cover" />}
        <p className="font-semibold">{context.profile?.name || profile?.display_name || profile?.username}</p>
      </div>
      {step === "languages" && <section className="space-y-6"><p className="text-muted-foreground">{t("intro")}</p><LanguageSetup value={preferences} onChange={setPreferences} disabled={busy} /><Button className="min-h-12 w-full" disabled={busy || !languagePreferencesSchema.safeParse(preferences).success} onClick={() => void saveLanguages()}>{common(busy ? "submitting" : "continue")}</Button></section>}
      {step === "menu" && <DrinkMenuSheet context={context} open onLater={() => setStep("done")} busy={busy} failed={failed} quantities={quantities} onChange={setQuantities} selected={selected} onSelect={setSelected} note={note} onNoteChange={setNote} onReserve={() => void reserve()} />}
      {step === "done" && <section className="space-y-6 py-3"><Check className="h-9 w-9 text-primary" aria-hidden /><h2 className="text-2xl font-semibold">{t("ready")}</h2><p className="text-muted-foreground">{t("prepareAtArrival")}</p>{order && <><ArrivalOrderView order={order} /><ExistingDrinkOffer eligible={context.sponsorEligibility?.eligible} event={context.event} order={order} onClaimed={setOrder} /></>}<Button asChild className="min-h-12 w-full"><Link href={`/events/${slug}`}>{common("backToEvent")}</Link></Button>{!order && <Button className="min-h-12 w-full" onClick={() => setStep("menu")}>{t(canChooseFreeDrink(context) ? "chooseFreeDrink" : "chooseFromMenu")}</Button>}<Button variant="ghost" onClick={() => setStep("languages")}>{t("editLanguages")}</Button></section>}
    </>}
    {failed && <p className="mt-4 text-destructive" role="alert">{common("errorGeneric")}</p>}
  </main>;
}
