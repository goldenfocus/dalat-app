"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  LANGUAGE_LEVELS,
  languageChoices,
  languageDisplayName,
  languageFlag,
  learningTargets,
  type LanguageLevel,
  type LanguagePreferences,
} from "@/lib/arrival/languages";
type Code = LanguagePreferences["learning"]["language"];

function LanguagePicker({
  value,
  onChange,
  disabled,
  excluded = [],
  label,
}: {
  value?: Code;
  onChange: (code: Code) => void;
  disabled?: boolean;
  excluded?: Code[];
  label: string;
}) {
  const t = useTranslations("arrival.languageSetup"),
    locale = useLocale();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const choices = useMemo(
    () =>
      languageChoices(locale, query).filter(
        (item) => !excluded.includes(item.code),
      ),
    [locale, query, excluded],
  );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          aria-label={value ? languageDisplayName(value, locale) : label}
          className="h-12 min-w-12 px-3 text-2xl"
        >
          {value ? (
            <span aria-hidden>{languageFlag(value)}</span>
          ) : (
            <Plus aria-hidden className="h-5 w-5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-2"
      >
        <div className="relative">
          <Search
            aria-hidden
            className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
          />
          <Input
            aria-label={t("search")}
            placeholder={t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 pl-9"
          />
        </div>
        <div
          className="mt-2 max-h-60 overflow-y-auto"
          role="group"
          aria-label={label}
        >
          {choices.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                onChange(item.code);
                setOpen(false);
                setQuery("");
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded px-3 text-left hover:bg-accent focus-visible:bg-accent"
            >
              <span aria-hidden>{languageFlag(item.code)}</span>
              <span className="flex-1">{item.label}</span>
              {value === item.code && <Check aria-hidden className="h-4 w-4" />}
            </button>
          ))}
          {!choices.length && (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              {t("noResults")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
function Level({
  value,
  onChange,
  native,
  disabled,
}: {
  value: LanguageLevel;
  onChange: (value: LanguageLevel) => void;
  native?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("arrival.languageSetup");
  return (
    <select
      aria-label={t("level")}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as LanguageLevel)}
      className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
    >
      {LANGUAGE_LEVELS.filter((level) => native || level !== "native").map(
        (level) => (
          <option key={level} value={level}>
            {t(`levels.${level}`)}
          </option>
        ),
      )}
    </select>
  );
}
/** Compact, reusable private profile; existing single-target records still round-trip. */
export function LanguageSetup({
  value,
  onChange,
  disabled,
}: {
  value: LanguagePreferences;
  onChange: (value: LanguagePreferences) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("arrival.languageSetup");
  const targets = learningTargets(value);
  const setTargets = (items: LanguagePreferences["learning"][]) =>
    onChange({
      ...value,
      learning: items[0],
      additionalLearning: items.slice(1),
    });
  return (
    <div className="space-y-5">
      <section aria-label={t("speak")}>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          {t("speak")}
        </h2>
        {value.speaks.map((entry, index) => (
          <div key={entry.language} className="flex items-center gap-2">
            <LanguagePicker
              value={entry.language}
              label={t("chooseSpoken")}
              disabled={disabled}
              excluded={value.speaks
                .filter((_, i) => i !== index)
                .map((p) => p.language)}
              onChange={(language) =>
                onChange({
                  ...value,
                  speaks: value.speaks.map((p, i) =>
                    i === index ? { ...p, language } : p,
                  ),
                })
              }
            />
            <Level
              value={entry.level}
              native
              disabled={disabled}
              onChange={(level) =>
                onChange({
                  ...value,
                  speaks: value.speaks.map((p, i) =>
                    i === index ? { ...p, level } : p,
                  ),
                })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              disabled={disabled}
              aria-label={t("removeLanguage")}
              onClick={() =>
                onChange({
                  ...value,
                  speaks: value.speaks.filter((_, i) => i !== index),
                })
              }
            >
              <X aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {value.speaks.length < 8 && (
          <LanguagePicker
            label={t(value.speaks.length ? "addLanguage" : "chooseSpoken")}
            disabled={disabled}
            excluded={value.speaks.map((p) => p.language)}
            onChange={(language) =>
              onChange({
                ...value,
                speaks: [...value.speaks, { language, level: "native" }],
              })
            }
          />
        )}
      </section>
      <section aria-label={t("learn")}>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          {t("learn")}
        </h2>
        {targets.map((entry, index) => (
          <div key={entry.language} className="flex items-center gap-2">
            <LanguagePicker
              value={entry.language}
              label={t("chooseLearning")}
              disabled={disabled}
              excluded={targets
                .filter((_, i) => i !== index)
                .map((p) => p.language)}
              onChange={(language) =>
                setTargets(
                  targets.map((p, i) => (i === index ? { ...p, language } : p)),
                )
              }
            />
            <Level
              value={entry.level}
              disabled={disabled}
              onChange={(level) => {
                if (level !== "native")
                  setTargets(
                    targets.map((p, i) => (i === index ? { ...p, level } : p)),
                  );
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              disabled={disabled || targets.length === 1}
              aria-label={t("removeLanguage")}
              onClick={() => setTargets(targets.filter((_, i) => i !== index))}
            >
              <X aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {targets.length < 8 && (
          <LanguagePicker
            label={t("addLanguage")}
            disabled={disabled}
            excluded={targets.map((p) => p.language)}
            onChange={(language) =>
              setTargets([...targets, { language, level: "new" }])
            }
          />
        )}
      </section>
    </div>
  );
}
