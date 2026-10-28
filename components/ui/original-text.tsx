"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Shared, keyboard-accessible original-text disclosure. Never replaces or loses the source. */
export function OriginalText({
  text,
  className,
  sourceLocale,
}: {
  text: string;
  className?: string;
  sourceLocale?: string;
}) {
  const t = useTranslations("translations");
  return (
    <details
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn("group text-sm text-muted-foreground", className)}
    >
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Languages className="h-4 w-4" aria-hidden="true" />
        <span>{t("showOriginal")}</span>
      </summary>
      <div
        lang={sourceLocale}
        className="mt-1 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-foreground"
      >
        {text}
      </div>
    </details>
  );
}
