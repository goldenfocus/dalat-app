import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { stripChannel } from '../preview-channel';

// The Global Twelve - all supported locales with full UI translations
// All 12 locale files in messages/*.json have complete translations
import { locales } from './locales';
export { locales } from './locales';
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

const navigation = createNavigation(routing);

export const { Link, redirect, useRouter, getPathname } = navigation;

/**
 * Pathname without the locale prefix, and without a preview channel prefix
 * (/v3/moments reads as /moments), so active-state checks hold in a preview.
 */
export function usePathname(): ReturnType<typeof navigation.usePathname> {
  return stripChannel(navigation.usePathname()) as ReturnType<
    typeof navigation.usePathname
  >;
}
