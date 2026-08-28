import type { Locale } from "@/lib/i18n/routing";

const SITE_URL = "https://dalat.app";
const DEFAULT_LOCALE: Locale = "en";

/**
 * Absolute URL honoring localePrefix: "as-needed". English lives at the
 * unprefixed root, while every other locale keeps its explicit prefix.
 */
export function localeUrl(locale: Locale, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const cleanPath = normalizedPath === "/" ? "" : normalizedPath;

  return locale === DEFAULT_LOCALE
    ? `${SITE_URL}${cleanPath}` || SITE_URL
    : `${SITE_URL}/${locale}${cleanPath}`;
}
