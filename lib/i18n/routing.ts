import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

// The Global Twelve - all supported locales with full UI translations
// All 12 locale files in messages/*.json have complete translations
export const locales = ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
  localePrefix: 'as-needed',  // Avoids redirect for default locale (performance)
  localeDetection: true,
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
