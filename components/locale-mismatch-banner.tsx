"use client";

import * as React from "react";
import { X, Globe } from "lucide-react";
import { Link, usePathname } from "@/lib/i18n/routing";
import { useLocale } from "next-intl";
import { CONTENT_LOCALES, LOCALE_FLAGS, LOCALE_NAMES, type ContentLocale } from "@/lib/types";

const STORAGE_KEY = "locale-mismatch-dismissed";

// Messages in the user's BROWSER language (not the URL locale)
// This way an English speaker on a French page sees English text
const MESSAGES: Record<ContentLocale, { message: string; switch: string; dismiss: string }> = {
  en: {
    message: "This page is in a different language.",
    switch: "View in English",
    dismiss: "Keep current language",
  },
  fr: {
    message: "Cette page est dans une autre langue.",
    switch: "Voir en français",
    dismiss: "Garder la langue actuelle",
  },
  vi: {
    message: "Trang này đang ở ngôn ngữ khác.",
    switch: "Xem bằng tiếng Việt",
    dismiss: "Giữ ngôn ngữ hiện tại",
  },
  // Fallback to English for other locales
  ko: { message: "This page is in a different language.", switch: "View in 한국어", dismiss: "Keep current language" },
  zh: { message: "This page is in a different language.", switch: "View in 中文", dismiss: "Keep current language" },
  ru: { message: "This page is in a different language.", switch: "View in Русский", dismiss: "Keep current language" },
  ja: { message: "This page is in a different language.", switch: "View in 日本語", dismiss: "Keep current language" },
  ms: { message: "This page is in a different language.", switch: "View in Bahasa Melayu", dismiss: "Keep current language" },
  th: { message: "This page is in a different language.", switch: "View in ไทย", dismiss: "Keep current language" },
  de: { message: "This page is in a different language.", switch: "View in Deutsch", dismiss: "Keep current language" },
  es: { message: "This page is in a different language.", switch: "View in Español", dismiss: "Keep current language" },
  id: { message: "This page is in a different language.", switch: "View in Indonesia", dismiss: "Keep current language" },
};

/**
 * Detects browser's preferred locale from navigator.languages
 * Returns the first matching supported locale, or null if none match
 */
function detectBrowserLocale(): ContentLocale | null {
  if (typeof navigator === "undefined") return null;

  const browserLanguages = navigator.languages || [navigator.language];

  for (const lang of browserLanguages) {
    // Get base language code (e.g., "en-US" -> "en")
    const baseCode = lang.split("-")[0].toLowerCase();
    if (CONTENT_LOCALES.includes(baseCode as ContentLocale)) {
      return baseCode as ContentLocale;
    }
  }

  return null;
}

/**
 * Banner that appears when the URL locale differs from the user's browser preference.
 * Offers a one-click switch to their preferred language.
 * Permanently dismissed once closed.
 */
export function LocaleMismatchBanner() {
  const urlLocale = useLocale() as ContentLocale;
  const pathname = usePathname();
  const [browserLocale, setBrowserLocale] = React.useState<ContentLocale | null>(null);
  const [isDismissed, setIsDismissed] = React.useState(true); // Start hidden to avoid flash

  // Detect browser locale on client mount
  React.useEffect(() => {
    const detected = detectBrowserLocale();
    setBrowserLocale(detected);

    // Check if user has permanently dismissed
    const dismissed = localStorage.getItem(STORAGE_KEY);
    setIsDismissed(dismissed === "true");
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsDismissed(true);
  };

  // Don't show if:
  // - No browser locale detected
  // - Browser locale matches URL locale
  // - User has permanently dismissed
  const shouldShow = browserLocale && browserLocale !== urlLocale && !isDismissed;

  if (!shouldShow) return null;

  return (
    // On mobile (lg:hidden), position above the floating RSVP bar which sits at bottom-[calc(4rem+env(safe-area-inset-bottom))]
    // On desktop (lg:), position at bottom-4 since there's no floating bar
    <div className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] lg:bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-card/95 backdrop-blur-md border border-border shadow-lg">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-xl flex-shrink-0">
          {LOCALE_FLAGS[browserLocale]}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">
            {MESSAGES[browserLocale].message}
          </p>
          <Link
            href={pathname}
            locale={browserLocale}
            replace
            onClick={handleDismiss}
            className="inline-flex items-center gap-1.5 mt-1 text-sm font-medium text-primary hover:underline"
          >
            <Globe className="w-3.5 h-3.5" />
            {MESSAGES[browserLocale].switch}
          </Link>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label={MESSAGES[browserLocale].dismiss}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
