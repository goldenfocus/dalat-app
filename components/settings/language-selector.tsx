"use client";

import { Check } from "lucide-react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { LOCALE_NAMES, LOCALE_FLAGS, SUPPORTED_LOCALES } from "@/lib/locale";
import { Link, usePathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";

interface LanguageSelectorProps {
  userId: string;
}

export function LanguageSelector({ userId }: LanguageSelectorProps) {
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;

  const handleLocaleClick = (newLocale: Locale) => {
    if (newLocale === currentLocale) return;

    // Set cookie for middleware (1 year expiry, secure in production)
    const secure = window.location.protocol === "https:" ? ";secure" : "";
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;samesite=lax${secure}`;

    // Update profile in database (fire-and-forget, navigation happens via Link)
    const supabase = createClient();
    supabase
      .from("profiles")
      .update({ locale: newLocale })
      .eq("id", userId)
      .then(() => {
        // Silent update - navigation already happened via Link
      });
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {SUPPORTED_LOCALES.map((l) => {
        const isSelected = currentLocale === l;
        return (
          <Link
            key={l}
            href={pathname}
            locale={l}
            replace
            onClick={() => handleLocaleClick(l)}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-200",
              isSelected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <div className="relative">
              <span className="text-2xl">{LOCALE_FLAGS[l]}</span>
              {isSelected && (
                <Check className="w-3 h-3 text-primary absolute -bottom-1 -right-1" />
              )}
            </div>
            <span
              className={cn(
                "text-sm font-medium",
                isSelected ? "text-primary" : "text-muted-foreground"
              )}
            >
              {LOCALE_NAMES[l]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}