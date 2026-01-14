/**
 * Utilities for time-based event archive pages
 * Supports SEO-friendly URLs like /events/2026/january
 */

// Month slugs in English (used in URLs)
const MONTH_SLUGS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

export type MonthSlug = (typeof MONTH_SLUGS)[number];

/**
 * Convert month number (1-12) to URL slug
 */
export function getMonthSlug(monthNumber: number): MonthSlug {
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid month number: ${monthNumber}`);
  }
  return MONTH_SLUGS[monthNumber - 1];
}

/**
 * Convert URL slug to month number (1-12)
 * Returns null if invalid slug
 */
export function getMonthNumber(slug: string): number | null {
  const index = MONTH_SLUGS.indexOf(slug.toLowerCase() as MonthSlug);
  return index === -1 ? null : index + 1;
}

/**
 * Check if a slug is a valid month
 */
export function isValidMonthSlug(slug: string): slug is MonthSlug {
  return MONTH_SLUGS.includes(slug.toLowerCase() as MonthSlug);
}

/**
 * Get adjacent months for navigation
 */
export function getAdjacentMonths(
  year: number,
  month: number
): {
  prev: { year: number; month: number; slug: MonthSlug } | null;
  next: { year: number; month: number; slug: MonthSlug } | null;
} {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Previous month
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  // Next month
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  // Don't allow navigation before app launch (2024) or too far into future
  const minYear = 2024;
  const maxYear = currentYear + 1;

  const prev =
    prevYear >= minYear
      ? { year: prevYear, month: prevMonth, slug: getMonthSlug(prevMonth) }
      : null;

  const next =
    nextYear <= maxYear
      ? { year: nextYear, month: nextMonth, slug: getMonthSlug(nextMonth) }
      : null;

  return { prev, next };
}

/**
 * Check if a year/month is valid for archive pages
 */
export function isValidArchiveDate(year: number, month: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Must be a valid month
  if (month < 1 || month > 12) return false;

  // Must be within reasonable range (app launched 2024, allow 1 year ahead)
  if (year < 2024 || year > currentYear + 1) return false;

  return true;
}

/**
 * Check if a month is in the past (for static generation decisions)
 */
export function isPastMonth(year: number, month: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear) return true;
  if (year === currentYear && month < currentMonth) return true;
  return false;
}

/**
 * Build archive URL path
 */
export function buildArchiveUrl(year: number, month: number): string {
  return `/events/${year}/${getMonthSlug(month)}`;
}

/**
 * Parse archive URL params
 */
export function parseArchiveParams(
  year: string,
  month: string
): { year: number; month: number } | null {
  const yearNum = parseInt(year, 10);
  const monthNum = getMonthNumber(month);

  if (isNaN(yearNum) || monthNum === null) return null;
  if (!isValidArchiveDate(yearNum, monthNum)) return null;

  return { year: yearNum, month: monthNum };
}

/**
 * All valid month slugs (for generateStaticParams)
 */
export function getAllMonthSlugs(): MonthSlug[] {
  return [...MONTH_SLUGS];
}
