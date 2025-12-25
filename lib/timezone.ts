// All events happen in Da Lat, Vietnam (UTC+7)
// Times are always stored and displayed in Da Lat timezone

export const DALAT_TIMEZONE = "Asia/Ho_Chi_Minh";

import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * Convert a date/time input (assumed to be Da Lat time) to UTC ISO string for storage
 * @param date - Date string "YYYY-MM-DD"
 * @param time - Time string "HH:mm"
 * @returns ISO string in UTC
 */
export function toUTCFromDaLat(date: string, time: string): string {
  // Parse as Da Lat time, convert to UTC
  const dalatDateTime = `${date}T${time}:00`;
  const utcDate = fromZonedTime(dalatDateTime, DALAT_TIMEZONE);
  return utcDate.toISOString();
}

/**
 * Format a UTC ISO string as Da Lat time
 * @param isoString - UTC ISO string from database
 * @param formatStr - date-fns format string
 * @returns Formatted string in Da Lat timezone
 */
export function formatInDaLat(isoString: string, formatStr: string): string {
  return formatInTimeZone(new Date(isoString), DALAT_TIMEZONE, formatStr);
}

/**
 * Get date and time parts from UTC ISO string in Da Lat timezone
 * For use in form default values
 */
export function getDateTimeInDaLat(isoString: string): { date: string; time: string } {
  return {
    date: formatInTimeZone(new Date(isoString), DALAT_TIMEZONE, "yyyy-MM-dd"),
    time: formatInTimeZone(new Date(isoString), DALAT_TIMEZONE, "HH:mm"),
  };
}
