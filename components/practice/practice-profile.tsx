"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LanguageSetup } from "@/components/arrival/language-setup";
import {
  DEFAULT_LANGUAGE_PREFERENCES,
  languagePreferencesSchema,
  type LanguagePreferences,
} from "@/lib/arrival/languages";
export function PracticeProfile({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("arrival");
  const [value, setValue] = useState<LanguagePreferences>(
      DEFAULT_LANGUAGE_PREFERENCES,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBusy(true);
    setError(false);
    void fetch("/api/arrival/languages", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error("load");
        const data = await r.json();
        const parsed = languagePreferencesSchema.safeParse(data.preferences);
        if (parsed.success) setValue(parsed.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [open]);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const r = await fetch("/api/arrival/languages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!r.ok) throw Error("save");
      onClose();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto p-5"
      >
        <SheetHeader>
          <SheetTitle>{t("languageTitle")}</SheetTitle>
        </SheetHeader>
        <div className="py-5">
          <LanguageSetup value={value} onChange={setValue} disabled={busy} />
        </div>
        {error && <p role="alert">{t("errorGeneric")}</p>}
        <Button
          className="min-h-12 w-full"
          disabled={busy || !languagePreferencesSchema.safeParse(value).success}
          onClick={() => void save()}
        >
          {t("continue")}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
