import type { Locale } from "@/lib/types";
import { formatInDaLat, formatInDaLatAsync } from "@/lib/timezone";

export interface EventDateDisplay {
  spansMultipleDays: boolean;
  startDate: string;
  startTime: string;
  endDate: string | null;
  endTime: string | null;
}

/**
 * Build the date/time values shown on an event page in Đà Lạt time.
 * Multi-day events expose both calendar dates instead of presenting the end
 * time as though it occurred on the start day.
 */
export async function getEventDateDisplay(
  startsAt: string,
  endsAt: string | null,
  locale: Locale
): Promise<EventDateDisplay> {
  const spansMultipleDays = Boolean(
    endsAt &&
      formatInDaLat(startsAt, "yyyy-MM-dd") !==
        formatInDaLat(endsAt, "yyyy-MM-dd")
  );

  const [startDate, startTime, endDate, endTime] = await Promise.all([
    formatInDaLatAsync(startsAt, "EEEE, MMMM d, yyyy", locale),
    formatInDaLatAsync(startsAt, "h:mm a", locale),
    spansMultipleDays && endsAt
      ? formatInDaLatAsync(endsAt, "EEEE, MMMM d, yyyy", locale)
      : Promise.resolve(null),
    endsAt
      ? formatInDaLatAsync(endsAt, "h:mm a", locale)
      : Promise.resolve(null),
  ]);

  return {
    spansMultipleDays,
    startDate,
    startTime,
    endDate,
    endTime,
  };
}
