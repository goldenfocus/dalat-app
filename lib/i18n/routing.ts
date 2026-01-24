import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

// The Global Twelve - all supported URL locales
// Full UI translations exist for: en, fr, vi
// Other locales fall back to English for UI but show translated content
export const locales = ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'] as const;
export type Locale = (typeof locales)[number];

// UI locales with full translation files
export const uiLocales = ['en', 'fr', 'vi'] as const;
export type UILocale = (typeof uiLocales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
  localePrefix: 'as-needed',  // Avoids redirect for default locale (performance)
  localeDetection: true,
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
