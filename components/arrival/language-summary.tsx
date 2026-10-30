"use client";

import { useLocale, useTranslations } from "next-intl";
import { languageDisplayName, type LanguagePreferences } from "@/lib/arrival/languages";

/** A private, event-time snapshot; never reads a guest's current profile. */
export function LanguageSummary({ value }: { value: LanguagePreferences }) {
  const locale = useLocale();
  const t = useTranslations("arrival.languageSetup");
  const describe = (entry: LanguagePreferences["speaks"][number]) => `${languageDisplayName(entry.language, locale)} · ${t(`levels.${entry.level}`)}`;
  return <dl className="mt-2 space-y-1 text-sm">
    <div><dt className="font-medium">{t("speak")}</dt><dd className="text-muted-foreground">{value.speaks.map(describe).join("; ")}</dd></div>
    <div><dt className="font-medium">{t("learn")}</dt><dd className="text-muted-foreground">{describe(value.learning)}</dd></div>
  </dl>;
}
