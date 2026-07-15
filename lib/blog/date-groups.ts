import { addHours } from "date-fns";

/**
 * Group items by how recently they were published, using Asia/Ho_Chi_Minh
 * (UTC+7, no DST) calendar-day boundaries — this is a Vietnam site, so
 * "Today" means today in Đà Lạt, not on the server.
 */

export type RecencyKey = "today" | "yesterday" | "thisWeek" | "older";

const GROUP_ORDER: RecencyKey[] = ["today", "yesterday", "thisWeek", "older"];
const VIETNAM_UTC_OFFSET_HOURS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Calendar day number in UTC+7 (Asia/Ho_Chi_Minh has no DST). */
function vietnamDayNumber(date: Date): number {
  return Math.floor(
    addHours(date, VIETNAM_UTC_OFFSET_HOURS).getTime() / MS_PER_DAY
  );
}

export function groupByRecency<T>(
  items: T[],
  getDate: (item: T) => string | null
): { key: RecencyKey; items: T[] }[] {
  const todayNumber = vietnamDayNumber(new Date());
  const buckets: Record<RecencyKey, T[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  for (const item of items) {
    const raw = getDate(item);
    const date = raw ? new Date(raw) : null;

    if (!date || Number.isNaN(date.getTime())) {
      buckets.older.push(item);
      continue;
    }

    const daysAgo = todayNumber - vietnamDayNumber(date);
    if (daysAgo <= 0) {
      buckets.today.push(item);
    } else if (daysAgo === 1) {
      buckets.yesterday.push(item);
    } else if (daysAgo < 7) {
      buckets.thisWeek.push(item);
    } else {
      buckets.older.push(item);
    }
  }

  return GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    items: buckets[key],
  }));
}
