"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LANGUAGE_LEVELS, type LanguageChoices, type LanguageLevel } from "@/lib/arrival/languages";

export function LanguageFields({ value, onChange, disabled = false }: {
  value: LanguageChoices;
  onChange: (value: LanguageChoices) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("arrival");
  const id = useId();
  return <div className="space-y-4">
    <fieldset disabled={disabled} className="grid grid-cols-3 gap-2">
      <legend className="mb-2 text-sm font-medium">{t("practiceLabel")}</legend>
      {(["english", "vietnamese", "both"] as const).map(language => <Button key={language} type="button" disabled={disabled} variant={value.practiceLanguage === language ? "secondary" : "outline"} aria-pressed={value.practiceLanguage === language} className="min-h-11 px-2" onClick={() => onChange({ ...value, practiceLanguage: language })}>{t(language)}</Button>)}
    </fieldset>
    <div className="grid grid-cols-2 gap-3">
      {(["englishLevel", "vietnameseLevel"] as const).map(key => <label key={key} htmlFor={`${id}-${key}`} className="block space-y-2">
        <span className="text-sm font-medium">{t(key)}</span>
        <select id={`${id}-${key}`} required disabled={disabled} value={value[key] || ""} onChange={event => onChange({ ...value, [key]: event.target.value as LanguageLevel })} className="min-h-12 w-full rounded-lg border border-input bg-background px-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="" disabled>{t("hostChoose")}</option>
          {LANGUAGE_LEVELS.map(level => <option key={level} value={level}>{t(`level_${level}`)}</option>)}
        </select>
      </label>)}
    </div>
  </div>;
}
