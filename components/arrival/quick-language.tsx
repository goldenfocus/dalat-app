"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { LanguagePreferences } from "@/lib/arrival/legacy-languages";

export const QUICK_SPEAKS = ["vietnamese", "english", "other"] as const;
export type QuickSpeaks = typeof QUICK_SPEAKS[number];

/**
 * One door answer becomes the legacy fields the arrival API stores. Someone who
 * speaks Vietnamese practises English and the reverse; any other speaker gets both.
 */
export function quickLanguageChoices(speaks: QuickSpeaks): LanguagePreferences {
  if (speaks === "vietnamese") return { practiceLanguage: "english", vietnameseLevel: "native", englishLevel: "some" };
  if (speaks === "english") return { practiceLanguage: "vietnamese", englishLevel: "fluent", vietnameseLevel: "starting" };
  return { practiceLanguage: "both", englishLevel: "comfortable", vietnameseLevel: "starting" };
}

// Endonyms stay in their own language for every visitor; only "Other" is translated.
const ENDONYMS = { vietnamese: { label: "Tiếng Việt", lang: "vi" }, english: { label: "English", lang: "en" } } as const;

export function QuickLanguage({ value, onChange, disabled = false }: {
  value: QuickSpeaks | null;
  onChange: (value: QuickSpeaks) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("arrival");
  return <fieldset disabled={disabled} className="grid grid-cols-3 gap-2">
    <legend className="mb-2 text-sm font-medium">{t("quickSpeak")}</legend>
    {QUICK_SPEAKS.map(speaks => <Button key={speaks} type="button" disabled={disabled} variant={value === speaks ? "default" : "outline"} aria-pressed={value === speaks} lang={speaks === "other" ? undefined : ENDONYMS[speaks].lang} className="min-h-14 whitespace-normal px-2 text-base" onClick={() => onChange(speaks)}>{speaks === "other" ? t("quickOther") : ENDONYMS[speaks].label}</Button>)}
  </fieldset>;
}
