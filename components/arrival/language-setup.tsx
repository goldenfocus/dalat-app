"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LANGUAGE_LEVELS, languageChoices, type LanguageLevel, type LanguagePreferences } from "@/lib/arrival/languages";

type LanguageCode = LanguagePreferences["learning"]["language"];

function LanguagePicker({ value, onChange, disabled, excluded = [], label }: {
  value?: LanguageCode; onChange: (code: LanguageCode) => void; disabled?: boolean; excluded?: LanguageCode[]; label: string;
}) {
  const t = useTranslations("arrival.languageSetup");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const choices = useMemo(() => languageChoices(locale, query).filter(item => !excluded.includes(item.code)), [locale, query, excluded]);
  const name = value ? new Intl.DisplayNames([locale], { type: "language" }).of(value) : null;
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(""); }}>
    <PopoverTrigger asChild><Button type="button" variant="outline" disabled={disabled} aria-label={label} className="min-h-12 w-full justify-between text-base"><span>{name || label}</span><ChevronDown className="h-4 w-4" aria-hidden="true" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input aria-label={t("search")} placeholder={t("search")} value={query} onChange={event => setQuery(event.target.value)} className="min-h-11 pl-9" /></div>
      <div className="mt-2 max-h-60 overflow-y-auto" role="group" aria-label={label}>
        {choices.map(item => <button key={item.code} type="button" onClick={() => { onChange(item.code); setOpen(false); setQuery(""); }} className="flex min-h-11 w-full items-center justify-between rounded px-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><span>{item.label}</span>{value === item.code && <Check className="h-4 w-4" aria-hidden="true" />}</button>)}
        {!choices.length && <p role="status" className="p-3 text-sm text-muted-foreground">{t("noResults")}</p>}
      </div>
    </PopoverContent>
  </Popover>;
}

function LevelPicker({ value, onChange, native, disabled }: { value: LanguageLevel; onChange: (level: LanguageLevel) => void; native?: boolean; disabled?: boolean }) {
  const t = useTranslations("arrival.languageSetup");
  return <fieldset className="mt-3"><legend className="sr-only">{t("level")}</legend><div className="flex flex-wrap gap-2">
    {LANGUAGE_LEVELS.filter(level => native || level !== "native").map(level => <Button key={level} type="button" variant={value === level ? "secondary" : "outline"} aria-pressed={value === level} disabled={disabled} onClick={() => onChange(level)} className="min-h-11 px-3">{t(`levels.${level}`)}</Button>)}
  </div></fieldset>;
}

/** Controlled form: account persistence and submission belong to the calling flow. */
export function LanguageSetup({ value, onChange, disabled }: { value: LanguagePreferences; onChange: (value: LanguagePreferences) => void; disabled?: boolean }) {
  const t = useTranslations("arrival.languageSetup");
  const updateSpoken = (index: number, change: Partial<LanguagePreferences["speaks"][number]>) => onChange({ ...value, speaks: value.speaks.map((entry, i) => i === index ? { ...entry, ...change } : entry) });
  return <div className="space-y-7">
    <section className="space-y-3" aria-label={t("speak")}>
      <div><h2 className="text-lg font-semibold">{t("speak")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("remember")}</p></div>
      {value.speaks.map((entry, index) => <div key={entry.language} className="border-b border-border pb-4">
        <div className="flex items-center gap-2"><LanguagePicker value={entry.language} onChange={language => updateSpoken(index, { language })} excluded={value.speaks.filter((_, i) => i !== index).map(item => item.language)} disabled={disabled} label={t("chooseSpoken")} /><Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" disabled={disabled} aria-label={t("removeLanguage")} onClick={() => onChange({ ...value, speaks: value.speaks.filter((_, i) => i !== index) })}><X className="h-4 w-4" aria-hidden="true" /></Button></div>
        <LevelPicker value={entry.level} onChange={level => updateSpoken(index, { level })} native disabled={disabled} />
      </div>)}
      {value.speaks.length < 8 && <div className="flex items-center gap-2"><Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><LanguagePicker onChange={language => onChange({ ...value, speaks: [...value.speaks, { language, level: "native" }] })} excluded={value.speaks.map(item => item.language)} disabled={disabled} label={t(value.speaks.length ? "addLanguage" : "chooseSpoken")} /></div>}
    </section>
    <section aria-label={t("learn")}><h2 className="mb-3 text-lg font-semibold">{t("learn")}</h2><LanguagePicker value={value.learning.language} onChange={language => onChange({ ...value, learning: { ...value.learning, language } })} disabled={disabled} label={t("chooseLearning")} /><LevelPicker value={value.learning.level} disabled={disabled} onChange={level => { if (level !== "native") onChange({ ...value, learning: { ...value.learning, level } }); }} /></section>
  </div>;
}
