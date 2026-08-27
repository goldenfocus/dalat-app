import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { DALAT_TIMEZONE } from "@/lib/timezone";

export interface DiscoveryWindow {
  start: Date;
  end: Date;
}

interface EventTiming {
  starts_at: string;
  ends_at: string | null;
}

function addLocalDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function atDaLatTime(dateKey: string, time: string): Date {
  return fromZonedTime(`${dateKey}T${time}`, DALAT_TIMEZONE);
}

export function getDaLatDateKey(date: Date): string {
  return formatInTimeZone(date, DALAT_TIMEZONE, "yyyy-MM-dd");
}

export function getDaLatIsoWeekday(date: Date): number {
  return Number(formatInTimeZone(date, DALAT_TIMEZONE, "i"));
}

/**
 * The evening people mean by "tonight": 5 PM until 4 AM in Da Lat.
 * Before 4 AM, it still refers to the evening that began the previous day.
 */
export function getTonightBounds(now: Date = new Date()): DiscoveryWindow {
  const localDate = getDaLatDateKey(now);
  const localHour = Number(formatInTimeZone(now, DALAT_TIMEZONE, "H"));
  const startDate = localHour < 4 ? addLocalDays(localDate, -1) : localDate;

  return {
    start: atDaLatTime(startDate, "17:00:00"),
    end: atDaLatTime(addLocalDays(startDate, 1), "04:00:00"),
  };
}

/**
 * In Da Lat, weekend plans begin on Friday. Before Friday, show the coming
 * Friday through Sunday. Once the weekend begins, omit days that have passed.
 */
export function getWeekendBounds(now: Date = new Date()): DiscoveryWindow {
  const localDate = getDaLatDateKey(now);
  const weekday = getDaLatIsoWeekday(now); // Monday=1 ... Sunday=7

  const daysUntilFriday = weekday <= 5 ? 5 - weekday : 0;
  const startDate = weekday <= 5 ? addLocalDays(localDate, daysUntilFriday) : localDate;
  const daysUntilSunday = 7 - weekday;
  const endDate = addLocalDays(localDate, daysUntilSunday);

  return {
    start: atDaLatTime(startDate, "00:00:00"),
    end: atDaLatTime(endDate, "23:59:59.999"),
  };
}

/** Keep future and in-progress cards, using the app's four-hour fallback. */
export function isEventCurrentOrFuture(
  event: EventTiming,
  now: Date = new Date()
): boolean {
  const startsAt = new Date(event.starts_at);
  const inferredEnd = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
  const endsAt = event.ends_at ? new Date(event.ends_at) : inferredEnd;
  return startsAt >= now || endsAt >= now;
}
