"use client";

import { useState, useEffect } from "react";
import { Check, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LOCALE_FLAGS, LOCALE_NAMES, type Locale } from "@/lib/types";

interface LanguageStepProps {
  currentLocale: Locale;
  onComplete: () => void;
}

// All 12 supported locales
const ALL_LOCALES: Locale[] = ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'];

// Map browser language codes to our locales
const BROWSER_LOCALE_MAP: Record<string, Locale> = {
  'en': 'en', 'en-US': 'en', 'en-GB': 'en',
  'vi': 'vi', 'vi-VN': 'vi',
  'ko': 'ko', 'ko-KR': 'ko',
  'zh': 'zh', 'zh-CN': 'zh', 'zh-TW': 'zh', 'zh-HK': 'zh',
  'ru': 'ru', 'ru-RU': 'ru',
  'fr': 'fr', 'fr-FR': 'fr', 'fr-CA': 'fr',
  'ja': 'ja', 'ja-JP': 'ja',
  'ms': 'ms', 'ms-MY': 'ms',
  'th': 'th', 'th-TH': 'th',
  'de': 'de', 'de-DE': 'de', 'de-AT': 'de', 'de-CH': 'de',
  'es': 'es', 'es-ES': 'es', 'es-MX': 'es',
  'id': 'id', 'id-ID': 'id',
};

// Native greetings for each locale (always shown in native language)
const LOCALE_GREETINGS: Record<Locale, string> = {
  en: "Hello!",
  vi: "Xin chào!",
  ko: "안녕하세요!",
  zh: "你好!",
  ru: "Привет!",
  fr: "Bonjour !",
  ja: "こんにちは!",
  ms: "Selamat!",
  th: "สวัสดี!",
  de: "Hallo!",
  es: "¡Hola!",
  id: "Halo!",
};

export function LanguageStep({ currentLocale, onComplete }: LanguageStepProps) {
  const t = useTranslations("onboarding");
  const tSettings = useTranslations("settings");
  const pathname = usePathname();
  const [detectedLocale, setDetectedLocale] = useState<Locale | null>(null);
  const [mounted, setMounted] = useState(false);

  // Trigger staggered animation on mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Detect browser language on mount
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage;
      if (browserLang) {
        // Try exact match first, then base language
        const detected = BROWSER_LOCALE_MAP[browserLang] || BROWSER_LOCALE_MAP[browserLang.split('-')[0]];
        if (detected) {
          setDetectedLocale(detected);
        }
      }
    }
  }, []);

  const handleLocaleClick = (locale: Locale) => {
    if (locale === currentLocale) return;
    // Set cookie for middleware (1 year expiry, secure in production)
    const secure = window.location.protocol === "https:" ? ";secure" : "";
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000;samesite=lax${secure}`;
    // Navigation happens via Link component
  };

  return (
    <div className="space-y-6">
      {/* Header icon with greeting */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Globe className="w-8 h-8 text-primary" />
        </div>

        {/* Animated greeting - shows in current language */}
        <div
          key={currentLocale}
          className="h-8 flex items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <span className="text-xl font-medium text-primary">
            {LOCALE_GREETINGS[currentLocale]} 👋
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-center text-muted-foreground">
        {tSettings("languageDescription")}
      </p>

      {/* Language grid with staggered reveal */}
      <div className="grid grid-cols-3 gap-2">
        {ALL_LOCALES.map((locale, index) => {
          const isSelected = currentLocale === locale;
          const isDetected = detectedLocale === locale;

          return (
            <Link
              key={locale}
              href={pathname}
              locale={locale}
              replace
              onClick={() => handleLocaleClick(locale)}
              style={{
                animationDelay: mounted ? `${index * 30}ms` : '0ms',
              }}
              className={cn(
                "relative flex flex-col items-center gap-1 p-3 rounded-xl border-2",
                "hover:bg-accent active:scale-95",
                "transition-[border-color,background-color,transform] duration-200",
                // Staggered reveal animation
                mounted
                  ? "animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                  : "opacity-0",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-primary/30"
              )}
            >
              {/* Detected indicator */}
              {isDetected && !isSelected && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}

              {/* Selected checkmark with scale animation */}
              {isSelected && (
                <span
                  className={cn(
                    "absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary",
                    "flex items-center justify-center",
                    "animate-in zoom-in-50 duration-200"
                  )}
                >
                  <Check className="w-3 h-3 text-primary-foreground" />
                </span>
              )}

              <span className="text-2xl">{LOCALE_FLAGS[locale]}</span>
              <span className="text-xs font-medium truncate w-full text-center">
                {LOCALE_NAMES[locale]}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Detected hint - now translated */}
      {detectedLocale && detectedLocale !== currentLocale && (
        <p className="text-xs text-center text-muted-foreground animate-in fade-in duration-500">
          {t("languageStep.detected")} {LOCALE_FLAGS[detectedLocale]} {LOCALE_NAMES[detectedLocale]}
        </p>
      )}

      {/* Continue button */}
      <Button onClick={() => onComplete()} className="w-full">
        {t("continue")}
      </Button>
    </div>
  );
}
