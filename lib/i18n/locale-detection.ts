import { LOCALES, type Locale } from '@/lib/types';

const supportedLocales = new Set<string>(LOCALES);

export function normalizeLocale(locale: string | null | undefined): Locale | null {
  if (!locale) return null;

  const baseLocale = locale.trim().toLowerCase().split('-')[0];
  return supportedLocales.has(baseLocale) ? (baseLocale as Locale) : null;
}

export function detectAcceptLanguage(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;

  return acceptLanguage
    .split(',')
    .map((entry, index) => {
      const [language, ...parameters] = entry.trim().split(';');
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().toLowerCase().startsWith('q='),
      );
      const parsedQuality = qualityParameter
        ? Number.parseFloat(qualityParameter.split('=')[1])
        : 1;

      return {
        locale: normalizeLocale(language),
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
        index,
      };
    })
    .filter((entry) => entry.locale && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)[0]?.locale ?? null;
}

interface PreferredLocaleSources {
  cookieLocale?: string | null;
  profileLocale?: string | null;
  acceptLanguage?: string | null;
  fallbackLocale?: Locale;
}

/**
 * Resolves the locale for an unprefixed URL.
 *
 * An explicit URL locale is handled before this function. A locale deliberately
 * selected on this device wins next, followed by the connected member profile,
 * the browser's Accept-Language preference, and finally English.
 */
export function resolvePreferredLocale({
  cookieLocale,
  profileLocale,
  acceptLanguage,
  fallbackLocale = 'en',
}: PreferredLocaleSources): Locale {
  return (
    normalizeLocale(cookieLocale) ??
    normalizeLocale(profileLocale) ??
    detectAcceptLanguage(acceptLanguage) ??
    fallbackLocale
  );
}
