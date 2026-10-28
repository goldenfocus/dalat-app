"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { TranslationContentType, TranslationFieldName } from "@/lib/types";

/** Inline reader for dynamic client surfaces, retaining the exact author text. */
export function TranslatedContent({
  type,
  id,
  field,
  original,
  textClassName,
}: {
  type: TranslationContentType;
  id: string;
  field: TranslationFieldName;
  original: string;
  textClassName?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("translations");
  const [value, setValue] = useState<{ key: string; text: string } | null>(
    null,
  );
  const [showOriginal, setShowOriginal] = useState(false);
  const key = `${locale}:${type}:${id}:${field}:${original}`;
  useEffect(() => {
    let active = true;
    createClient()
      .from("content_translations")
      .select("translated_text")
      .eq("content_type", type)
      .eq("content_id", id)
      .eq("target_locale", locale)
      .eq("field_name", field)
      .maybeSingle()
      .then(({ data }: { data: { translated_text: string } | null }) => {
        if (active) setValue({ key, text: data?.translated_text || original });
      });
    return () => {
      active = false;
    };
  }, [locale, type, id, field, original, key]);
  const translated = value?.key === key ? value.text : original;
  if (translated === original)
    return <span className={textClassName}>{original}</span>;
  return (
    <span className="whitespace-pre-wrap">
      <span className={showOriginal ? undefined : textClassName}>
        {showOriginal ? original : translated}
      </span>{" "}
      <button
        type="button"
        aria-pressed={showOriginal}
        title={t("showOriginal")}
        aria-label={t("showOriginal")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setShowOriginal(!showOriginal);
        }}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Languages className="h-4 w-4" aria-hidden="true" />
      </button>
    </span>
  );
}
