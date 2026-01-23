// All events happen in Đà Lạt, Vietnam (UTC+7)
// Times are always stored and displayed in Đà Lạt timezone

export const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Locale as DateFnsLocale } from "date-fns";
import type { Locale } from "@/lib/types";

// Only import English locale statically (most common fallback)
// Other locales are dynamically imported on-demand to reduce bundle size by ~100KB
import { enUS } from "date-fns/locale";

// Cache for dynamically loaded locales
const localeCache: Partial<Record<Locale, DateFnsLocale>> = {
  en: enUS, // Pre-loaded
};

// Dynamic locale loaders - these are code-split by webpack/turbopack
const localeLoaders: Record<Locale, () => Promise<DateFnsLocale>> = {
  en: async () => enUS,
  vi: async () => (await import("date-fns/locale/vi")).vi,
  ko: async () => (await import("date-fns/locale/ko")).ko,
  zh: async () => (await import("date-fns/locale/zh-CN")).zhCN,
  ru: async () => (await import("date-fns/locale/ru")).ru,
  fr: async () => (await import("date-fns/locale/fr")).fr,
  ja: async () => (await import("date-fns/locale/ja")).ja,
  ms: async () => (await import("date-fns/locale/ms")).ms,
  th: async () => (await import("date-fns/locale/th")).th,
  de: async () => (await import("date-fns/locale/de")).de,
  es: async () => (await import("date-fns/locale/es")).es,
  id: async () => (await import("date-fns/locale/id")).id,
};

/**
 * Get date-fns locale object (async for dynamic loading).
 * Returns cached locale if available, otherwise loads dynamically.
 */
export async function loadDateFnsLocale(locale: Locale): Promise<DateFnsLocale> {
  if (localeCache[locale]) {
    return localeCache[locale]!;
  }

  try {
    const loadedLocale = await localeLoaders[locale]();
    localeCache[locale] = loadedLocale;
    return loadedLocale;
  } catch {
    return enUS;
  }
}

/**
 * Get date-fns locale synchronously (uses cache, falls back to English).
 * For best results, call loadDateFnsLocale first to warm the cache.
 */
export function getDateFnsLocale(locale: Locale): DateFnsLocale {
  return localeCache[locale] || enUS;
}

/**
 * Convert a date/time input (assumed to be Đà Lạt time) to UTC ISO string for storage
 * @param date - Date string "YYYY-MM-DD"
 * @param time - Time string "HH:mm"
 * @returns ISO string in UTC
 */
export function toUTCFromDaLat(date: string, time: string): string {
  // Parse as Đà Lạt time, convert to UTC
  const dalatDateTime = `${date}T${time}:00`;
  const utcDate = fromZonedTime(dalatDateTime, DALAT_TIMEZONE);
  return utcDate.toISOString();
}

/**
 * Format a UTC ISO string as Đà Lạt time
 * @param isoString - UTC ISO string from database
 * @param formatStr - date-fns format string
 * @param locale - Optional locale for translated day/month names
 * @returns Formatted string in Đà Lạt timezone
 */
export function formatInDaLat(isoString: string, formatStr: string, locale?: Locale): string {
  const options = locale ? { locale: getDateFnsLocale(locale) } : undefined;
  return formatInTimeZone(new Date(isoString), DALAT_TIMEZONE, formatStr, options);
}

/**
 * Get date and time parts from UTC ISO string in Đà Lạt timezone
 * For use in form default values
 */
export function getDateTimeInDaLat(isoString: string): { date: string; time: string } {
  return {
    date: formatInTimeZone(new Date(isoString), DALAT_TIMEZONE, "yyyy-MM-dd"),
    time: formatInTimeZone(new Date(isoString), DALAT_TIMEZONE, "HH:mm"),
  };
}
