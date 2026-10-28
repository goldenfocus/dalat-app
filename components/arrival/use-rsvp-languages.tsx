"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { completeLanguageChoices, emptyLanguageChoices, type LanguageChoices } from "@/lib/arrival/languages";
import { LanguageFields } from "./language-fields";

/** Collect preferences before RSVP, without creating an arrival or an order. */
export function useRsvpLanguages(slug?: string) {
  const t = useTranslations("arrival");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [value, setValue] = useState<LanguageChoices>(emptyLanguageChoices);
  const pending = useRef(false);
  const continuation = useRef<() => Promise<unknown>>(async () => {});
  const endpoint = `/api/events/${encodeURIComponent(slug || "")}/arrival/preferences`;

  async function beforeRsvp(proceed: () => Promise<unknown>) {
    if (!slug) { await proceed(); return; }
    if (pending.current) return;
    pending.current = true;
    continuation.current = proceed;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("preferences_unavailable");
      const result = await response.json();
      if (result.preferences && completeLanguageChoices(result.preferences)) {
        await proceed();
      } else {
        setOpen(true);
      }
    } catch { setError(true); setOpen(true); }
    finally { setBusy(false); pending.current = false; }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !completeLanguageChoices(value)) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      if (!response.ok) throw new Error("preferences_not_saved");
      setOpen(false);
      await continuation.current();
    } catch { setError(true); setOpen(true); }
    finally { setBusy(false); pending.current = false; }
  }

  const languageSheet = slug ? <Sheet open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
    <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <SheetHeader className="mb-5 text-left"><SheetTitle className="pr-6 text-xl">{t("languageTitle")}</SheetTitle></SheetHeader>
      <form onSubmit={save} className="space-y-5">
        <LanguageFields value={value} onChange={setValue} disabled={busy} />
        {error && <p role="alert" className="text-sm text-destructive">{t("errorGeneric")}</p>}
        <Button type="submit" loading={busy} disabled={busy || !completeLanguageChoices(value)} className="min-h-12 w-full">{t("confirmRsvp")}</Button>
      </form>
    </SheetContent>
  </Sheet> : null;
  return { beforeRsvp, languageSheet, languagePending: busy };
}
