/**
 * Date Generation for Recurring Events
 *
 * Expands RRULE patterns into concrete occurrence dates.
 */

import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  isBefore,
  isSameDay,
  getDay,
  setDay,
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from "date-fns";
import { parseRRule } from "./rrule";
import type { EventSeries } from "@/lib/types";

// Map RRULE day codes to date-fns day numbers (0=Sunday)
const WEEKDAY_TO_NUM: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

interface GenerationConfig {
  rrule: string;
  firstOccurrence: Date;
  generateFrom: Date;
  generateUntil: Date;
  rruleUntil?: Date | null;
  rruleCount?: number | null;
  excludeDates?: Set<string>; // YYYY-MM-DD format
}

/**
 * Generate occurrence dates for a recurring event
 */
export function generateOccurrences(config: GenerationConfig): Date[] {
  const {
    rrule,
    firstOccurrence,
    generateFrom,
    generateUntil,
    rruleUntil,
    rruleCount,
    excludeDates = new Set(),
  } = config;

  const parsed = parseRRule(rrule);
  const occurrences: Date[] = [];

  // Determine actual end date (earliest of generateUntil and rruleUntil)
  let effectiveEndDate = generateUntil;
  if (rruleUntil && isBefore(rruleUntil, generateUntil)) {
    effectiveEndDate = rruleUntil;
  }

  // Start from first occurrence
  let current = new Date(firstOccurrence);
  let count = 0;
  const maxCount = rruleCount ?? Infinity;

  // Safety limit to prevent infinite loops
  const maxIterations = 1000;
  let iterations = 0;

  while (
    isBefore(current, effectiveEndDate) &&
    count < maxCount &&
    iterations < maxIterations
  ) {
    iterations++;
    const dateStr = format(current, "yyyy-MM-dd");

    // Check if this date should be included
    if (!excludeDates.has(dateStr)) {
      // Only include dates >= generateFrom
      if (!isBefore(current, generateFrom)) {
        occurrences.push(new Date(current));
      }
      count++; // Count all occurrences, even skipped ones, for RRULE COUNT
    }

    // Get next occurrence based on frequency
    current = getNextOccurrence(current, parsed);
  }

  return occurrences;
}

/**
 * Get the next occurrence date based on recurrence pattern
 */
function getNextOccurrence(
  current: Date,
  rule: ReturnType<typeof parseRRule>
): Date {
  const { frequency, interval, weekDays, monthDay, monthWeekDay } = rule;

  switch (frequency) {
    case "DAILY":
      return addDays(current, interval);

    case "WEEKLY":
      if (weekDays.length === 0) {
        // Simple weekly on same day
        return addWeeks(current, interval);
      }
      // Find next day in weekDays
      return getNextWeeklyOccurrence(current, weekDays, interval);

    case "MONTHLY":
      if (monthWeekDay) {
        // Nth weekday of month (e.g., 2nd Tuesday)
        return getNextMonthlyWeekdayOccurrence(current, monthWeekDay, interval);
      }
      if (monthDay) {
        // Specific day of month
        return getNextMonthlyDayOccurrence(current, monthDay, interval);
      }
      // Default: same day each month
      return addMonths(current, interval);

    case "YEARLY":
      return addYears(current, interval);

    default:
      return addWeeks(current, interval);
  }
}

/**
 * Get next weekly occurrence with specific weekdays
 */
function getNextWeeklyOccurrence(
  current: Date,
  weekDays: string[],
  interval: number
): Date {
  const currentDayNum = getDay(current);
  const targetDays = weekDays.map((d) => WEEKDAY_TO_NUM[d]).sort((a, b) => a - b);

  // Find next day in current week
  for (const dayNum of targetDays) {
    if (dayNum > currentDayNum) {
      return setDay(current, dayNum);
    }
  }

  // Move to next interval and pick first day
  const nextWeekStart = addWeeks(current, interval);
  const firstTargetDay = targetDays[0];
  // Set to start of week (Sunday) then to first target day
  return setDay(addDays(nextWeekStart, -getDay(nextWeekStart)), firstTargetDay);
}

/**
 * Get next monthly occurrence by nth weekday
 */
function getNextMonthlyWeekdayOccurrence(
  current: Date,
  monthWeekDay: { week: number; day: string },
  interval: number
): Date {
  const { week, day } = monthWeekDay;
  const targetDayNum = WEEKDAY_TO_NUM[day];

  // Try next month
  const nextMonth = addMonths(current, interval);

  // Find the nth weekday of that month
  const occurrence = getNthWeekdayOfMonth(nextMonth, week, targetDayNum);

  // If we get a valid date, return it
  if (occurrence) {
    return occurrence;
  }

  // Edge case: no valid date in that month (e.g., 5th Monday doesn't exist)
  // Skip to next month
  return getNextMonthlyWeekdayOccurrence(nextMonth, monthWeekDay, interval);
}

/**
 * Get the nth weekday of a month
 */
function getNthWeekdayOfMonth(
  date: Date,
  n: number,
  targetDayNum: number
): Date | null {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);

  // Get all days in the month
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Filter to target weekday
  const targetDays = daysInMonth.filter((d) => getDay(d) === targetDayNum);

  if (n === -1) {
    // Last occurrence
    return targetDays[targetDays.length - 1] || null;
  }

  // Nth occurrence (1-indexed)
  return targetDays[n - 1] || null;
}

/**
 * Get next monthly occurrence by day of month
 */
function getNextMonthlyDayOccurrence(
  current: Date,
  dayOfMonth: number,
  interval: number
): Date {
  const nextMonth = addMonths(current, interval);

  // Handle months with fewer days (e.g., Feb 30 -> Feb 28)
  const targetDate = new Date(nextMonth);
  targetDate.setDate(Math.min(dayOfMonth, endOfMonth(nextMonth).getDate()));

  return targetDate;
}

/**
 * Generate instances for a series within a date range
 */
export function generateSeriesInstances(
  series: Pick<
    EventSeries,
    "rrule" | "first_occurrence" | "rrule_until" | "rrule_count"
  >,
  generateFrom: Date,
  generateUntil: Date,
  excludeDates?: string[]
): Date[] {
  return generateOccurrences({
    rrule: series.rrule,
    firstOccurrence: new Date(series.first_occurrence),
    generateFrom,
    generateUntil,
    rruleUntil: series.rrule_until ? new Date(series.rrule_until) : null,
    rruleCount: series.rrule_count,
    excludeDates: new Set(excludeDates),
  });
}

/**
 * Get the next N occurrence dates from today
 */
export function getUpcomingOccurrences(
  rrule: string,
  firstOccurrence: Date,
  count: number = 10,
  rruleUntil?: Date | null,
  rruleCount?: number | null
): Date[] {
  const now = new Date();
  const farFuture = addYears(now, 2); // Look up to 2 years ahead

  const allOccurrences = generateOccurrences({
    rrule,
    firstOccurrence,
    generateFrom: now,
    generateUntil: farFuture,
    rruleUntil,
    rruleCount,
  });

  return allOccurrences.slice(0, count);
}

/**
 * Check if a specific date is an occurrence of the recurrence pattern
 */
export function isOccurrenceDate(
  date: Date,
  rrule: string,
  firstOccurrence: Date,
  rruleUntil?: Date | null,
  rruleCount?: number | null
): boolean {
  // Generate occurrences in a small window around the date
  const windowStart = addDays(date, -1);
  const windowEnd = addDays(date, 1);

  const occurrences = generateOccurrences({
    rrule,
    firstOccurrence,
    generateFrom: windowStart,
    generateUntil: windowEnd,
    rruleUntil,
    rruleCount,
  });

  return occurrences.some((occ) => isSameDay(occ, date));
}

/**
 * Get the occurrence count up to a specific date
 */
export function getOccurrenceCount(
  rrule: string,
  firstOccurrence: Date,
  untilDate: Date
): number {
  const occurrences = generateOccurrences({
    rrule,
    firstOccurrence,
    generateFrom: firstOccurrence,
    generateUntil: untilDate,
  });

  return occurrences.length;
}

/**
 * Format an occurrence date for display
 */
export function formatOccurrenceDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
