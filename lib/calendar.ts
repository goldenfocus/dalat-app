import { format, isValid, parseISO, startOfDay } from "date-fns";
import { formatInDaLat } from "@/lib/timezone";
import type { Event } from "@/lib/types";

export type CalendarView = "day" | "week" | "month";
export type CalendarEvent = Pick<Event,
  "id" | "slug" | "title" | "image_url" | "starts_at" | "ends_at" |
  "location_name" | "ai_tags" | "source_metadata" | "source_locale"
> & { originalTitle?: string };

/** Calendar dates are wall dates, not UTC timestamps. */
export function parseCalendarDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parseISO(value);
  return isValid(date) && format(date, "yyyy-MM-dd") === value ? startOfDay(date) : null;
}

export function todayInDaLat(now = new Date()): string {
  return formatInDaLat(now.toISOString(), "yyyy-MM-dd");
}

export function readCalendarState(params: URLSearchParams, today: string) {
  const requestedView = params.get("view");
  const view: CalendarView = requestedView === "day" || requestedView === "month" ? requestedView : "week";
  const date = parseCalendarDate(params.get("date")) ?? parseCalendarDate(today)!;
  const tripStart = parseCalendarDate(params.get("from"));
  const tripEnd = parseCalendarDate(params.get("to"));
  const validTrip = tripStart && tripEnd && tripStart <= tripEnd;
  return {
    view,
    date,
    selectedDate: date,
    tripStartDate: validTrip ? params.get("from") : null,
    tripEndDate: validTrip ? params.get("to") : null,
  };
}

export function formatCalendarDate(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  // Browser ICU data can spell localized month/day labels differently from
  // Node's ICU; date text elements opt out of hydration text equality only.
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, options).format(date);
}
