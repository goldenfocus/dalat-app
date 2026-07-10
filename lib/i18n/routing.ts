import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

// The Global Twelve - all supported locales with full UI translations
// All 12 locale files in messages/*.json have complete translations
export const locales = ['en', 'vi', 'ko', 'zh', 'ru', 'fr', 'ja', 'ms', 'th', 'de', 'es', 'id'] as const;
export type Locale = (typeof locales)[number];

// Locales prerendered at build time (generateStaticParams). The other locales
// still work — dynamicParams is true everywhere, so they render on first
// request via ISR and are cached after that. Keeping this list short is what
// keeps Vercel builds fast: every entry multiplies the static page count.
export const buildLocales = ['en', 'vi'] as const satisfies readonly Locale[];

export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
  localePrefix: 'as-needed',  // Avoids redirect for default locale (performance)
  localeDetection: true,
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
