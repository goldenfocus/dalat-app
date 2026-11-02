"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/lib/i18n/routing";

export function PracticeLanguage() {
  const locale = useLocale();
  const t = useTranslations("eventPractice");
  const pathname = usePathname();
  const router = useRouter();
  return <nav aria-label={t("languageLabel")} className="flex items-center gap-4 text-sm">
    {([['en', 'English'], ['vi', 'Tiếng Việt']] as const).map(([value, label]) => <button type="button" key={value} lang={value} aria-current={locale === value ? "true" : undefined} className="practice-language min-h-11 border-b-2 border-transparent font-medium text-muted-foreground" onClick={() => router.replace(`${pathname}${window.location.search}`, { locale: value })}>{label}</button>)}
  </nav>;
}
