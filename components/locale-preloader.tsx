"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { loadDateFnsLocale } from "@/lib/timezone";
import type { Locale } from "@/lib/types";

/**
 * Preloads the user's date-fns locale on app mount.
 * This warms the cache so formatInDaLat() works synchronously.
 *
 * The locale is dynamically imported to reduce initial bundle size by ~100KB.
 */
export function LocalePreloader() {
  const locale = useLocale() as Locale;

  useEffect(() => {
    // Preload the locale in the background
    loadDateFnsLocale(locale);
  }, [locale]);

  return null;
}
