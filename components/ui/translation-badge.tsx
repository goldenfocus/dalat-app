"use client";

import { Bot, CheckCircle2, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { OriginalText } from "./original-text";
import { cn } from "@/lib/utils";
import {
  LOCALE_FLAGS,
  LOCALE_NAMES,
  type ContentLocale,
  type TranslationStatus,
} from "@/lib/types";

interface TranslationBadgeProps {
  sourceLocale: ContentLocale;
  status?: TranslationStatus;
  className?: string;
  /** Show compact version (just flag + icon) */
  compact?: boolean;
}

/**
 * Badge indicating content has been translated.
 * Shows source language flag and translation status.
 */
export function TranslationBadge({
  sourceLocale,
  status = "auto",
  className,
  compact = false,
}: TranslationBadgeProps) {
  const flag = LOCALE_FLAGS[sourceLocale];
  const langName = LOCALE_NAMES[sourceLocale];

  const isHumanReviewed = status === "reviewed" || status === "edited";

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground",
          className,
        )}
        title={langName}
      >
        <span>{flag}</span>
        {isHumanReviewed ? (
          <CheckCircle2 className="w-3 h-3 text-green-500" />
        ) : (
          <Bot className="w-3 h-3" />
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs",
        "bg-muted/50 text-muted-foreground",
        "border border-border/50",
        className,
      )}
      title={langName}
    >
      <Languages className="w-3 h-3" />
      <span>{flag}</span>
      {isHumanReviewed ? (
        <CheckCircle2 className="w-3 h-3 text-green-500" />
      ) : (
        <Bot className="w-3 h-3" />
      )}
    </span>
  );
}

interface TranslatedFromProps {
  sourceLocale?: ContentLocale | null;
  originalText: string | undefined;
  className?: string;
}

/**
 * Shows "Translated from [language]" with original text toggle.
 * More prominent than TranslationBadge, used for main content areas.
 */
export function TranslatedFrom({
  sourceLocale,
  originalText,
  className,
}: TranslatedFromProps) {
  const t = useTranslations("translations");
  const flag = sourceLocale ? LOCALE_FLAGS[sourceLocale] : undefined;
  const langName = sourceLocale ? LOCALE_NAMES[sourceLocale] : undefined;

  return (
    <div className={cn("text-sm text-muted-foreground", className)}>
      {sourceLocale && (
        <span className="inline-flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5" />
          <span>
            {t("translatedFrom")} {flag} {langName}
          </span>
        </span>
      )}
      {originalText && (
        <OriginalText
          text={originalText}
          sourceLocale={sourceLocale || undefined}
        />
      )}
    </div>
  );
}
