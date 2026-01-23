"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { LOCALE_NAMES, LOCALE_FLAGS, SUPPORTED_LOCALES } from "@/lib/locale";
import { useRouter, usePathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";

interface LanguageSelectorProps {
  userId: string;
}

export function LanguageSelector({ userId }: LanguageSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  // Use URL locale (from next-intl) instead of profile.locale for consistency
  const currentLocale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);

  const changeLocale = (newLocale: Locale) => {
    if (newLocale === currentLocale) return;

    setPendingLocale(newLocale);
    const supabase = createClient();
    startTransition(async () => {
      // Update profile in database
      await supabase
        .from("profiles")
        .update({ locale: newLocale })
        .eq("id", userId);

      // Set cookie for middleware (1 year expiry, secure in production)
      const secure = window.location.protocol === 'https:' ? ';secure' : '';
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;samesite=lax${secure}`;

      // Navigate to same page in new locale
      router.replace(pathname, { locale: newLocale });
    });
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {SUPPORTED_LOCALES.map((l) => {
        const isSelected = currentLocale === l;
        const isChanging = isPending && pendingLocale === l;
        return (
          <button
            key={l}
            onClick={() => changeLocale(l)}
            disabled={isPending}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-200",
              isSelected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-primary/50 hover:bg-muted/50",
              isPending && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="relative">
              <span className="text-2xl">{LOCALE_FLAGS[l]}</span>
              {isSelected && !isChanging && (
                <Check className="w-3 h-3 text-primary absolute -bottom-1 -right-1" />
              )}
              {isChanging && (
                <Loader2 className="w-3 h-3 text-primary absolute -bottom-1 -right-1 animate-spin" />
              )}
            </div>
            <span className={cn("text-sm font-medium", isSelected ? "text-primary" : "text-muted-foreground")}>
              {LOCALE_NAMES[l]}
            </span>
          </button>
        );
      })}
    </div>
  );
}