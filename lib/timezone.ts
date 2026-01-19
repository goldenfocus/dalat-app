// All events happen in Đà Lạt, Vietnam (UTC+7)
// Times are always stored and displayed in Đà Lạt timezone

export const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";

import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import type { Locale as DateFnsLocale } from "date-fns";
import { enUS, vi, ko, zhCN, ru, fr, ja, ms, th, de, es, id } from "date-fns/locale";
import type { Locale } from "@/lib/types";

// Map our locale codes to date-fns locale objects
const dateFnsLocales: Record<Locale, DateFnsLocale> = {
  en: enUS,
  vi: vi,
  ko: ko,
  zh: zhCN,
  ru: ru,
  fr: fr,
  ja: ja,
  ms: ms,
  th: th,
  de: de,
  es: es,
  id: id,
};

export function getDateFnsLocale(locale: Locale): DateFnsLocale {
  return dateFnsLocales[locale] || enUS;
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
