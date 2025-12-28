"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LOCALE_NAMES, LOCALE_FLAGS, SUPPORTED_LOCALES } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";

interface LanguageSelectorProps {
  userId: string;
  currentLocale: Locale;
}

export function LanguageSelector({ userId, currentLocale }: LanguageSelectorProps) {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>(currentLocale);
  const [isPending, startTransition] = useTransition();

  const changeLocale = (newLocale: Locale) => {
    if (newLocale === locale) return;

    setLocale(newLocale);
    const supabase = createClient();
    startTransition(async () => {
      await supabase
        .from("profiles")
        .update({ locale: newLocale })
        .eq("id", userId);
      router.refresh();
    });
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {SUPPORTED_LOCALES.map((l) => {
        const isSelected = locale === l;
        const isChanging = isPending && locale === l;
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
