/**
 * RRULE (RFC 5545) Utility Functions
 *
 * Handles building and parsing iCalendar RRULE strings for recurring events.
 * Format: FREQ=WEEKLY;BYDAY=TU;INTERVAL=2
 */

import { getDay } from "date-fns";
import type { RecurrenceFrequency, RecurrenceFormData, RecurrencePreset } from "@/lib/types";

// Day abbreviations in RRULE format
const WEEKDAY_MAP: Record<number, string> = {
  0: "SU",
  1: "MO",
  2: "TU",
  3: "WE",
  4: "TH",
  5: "FR",
  6: "SA",
};

const _WEEKDAY_REVERSE: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const WEEKDAY_NAMES: Record<string, string> = {
  SU: "Sunday",
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
};

const ORDINAL_NAMES: Record<number, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  5: "fifth",
  [-1]: "last",
};

/**
 * Build an RRULE string from form data
 */
export function buildRRule(data: RecurrenceFormData): string {
  if (!data.isRecurring) {
    return "";
  }

  const parts: string[] = [`FREQ=${data.frequency}`];

  // Interval (only include if > 1)
  if (data.interval && data.interval > 1) {
    parts.push(`INTERVAL=${data.interval}`);
  }

  // Day selection for WEEKLY frequency
  if (data.frequency === "WEEKLY" && data.weekDays.length > 0) {
    parts.push(`BYDAY=${data.weekDays.join(",")}`);
  }

  // Day selection for MONTHLY frequency
  if (data.frequency === "MONTHLY") {
    if (data.monthWeekDay) {
      // Nth weekday of month (e.g., 2TU = 2nd Tuesday)
      const { week, day } = data.monthWeekDay;
      parts.push(`BYDAY=${week}${day}`);
    } else if (data.monthDay) {
      // Specific day of month (e.g., 15th)
      parts.push(`BYMONTHDAY=${data.monthDay}`);
    }
  }

  // End condition: COUNT
  // Note: UNTIL is stored separately in the database, not in RRULE
  if (data.endType === "count" && data.endCount) {
    parts.push(`COUNT=${data.endCount}`);
  }

  return parts.join(";");
}

/**
 * Parse an RRULE string into form data
 */
export function parseRRule(rrule: string): RecurrenceFormData {
  if (!rrule) {
    return getDefaultRecurrenceData();
  }

  const parts = Object.fromEntries(
    rrule.split(";").map((p) => {
      const [key, value] = p.split("=");
      return [key, value];
    })
  );

  const frequency = (parts.FREQ as RecurrenceFrequency) || "WEEKLY";
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1;

  // Parse BYDAY for weekly (simple) or monthly (with position)
  let weekDays: string[] = [];
  let monthWeekDay: { week: number; day: string } | undefined;

  if (parts.BYDAY) {
    const byDay = parts.BYDAY;
    // Check if it has a position prefix (e.g., "2TU" or "-1FR")
    const posMatch = byDay.match(/^(-?\d)([A-Z]{2})$/);
    if (posMatch) {
      monthWeekDay = {
        week: parseInt(posMatch[1], 10),
        day: posMatch[2],
      };
    } else {
      // Simple comma-separated days
      weekDays = byDay.split(",").filter((d) => /^[A-Z]{2}$/.test(d));
    }
  }

  const monthDay = parts.BYMONTHDAY ? parseInt(parts.BYMONTHDAY, 10) : null;

  return {
    isRecurring: true,
    frequency,
    interval,
    weekDays,
    monthDay,
    monthWeekDay: monthWeekDay || null,
    endType: parts.COUNT ? "count" : "never",
    endCount: parts.COUNT ? parseInt(parts.COUNT, 10) : undefined,
  };
}

/**
 * Get default recurrence form data
 */
export function getDefaultRecurrenceData(): RecurrenceFormData {
  return {
    isRecurring: false,
    frequency: "WEEKLY",
    interval: 1,
    weekDays: [],
    monthDay: null,
    monthWeekDay: null,
    endType: "never",
  };
}

/**
 * Get a human-readable description of an RRULE
 */
export function describeRRule(rrule: string): string {
  if (!rrule) return "";

  const data = parseRRule(rrule);

  let description = "";

  // Frequency and interval
  const freqName = data.frequency.toLowerCase();
  if (data.interval === 1) {
    description = `Every ${freqName.replace("ly", "")}`;
  } else {
    const unitMap: Record<string, string> = {
      DAILY: "days",
      WEEKLY: "weeks",
      MONTHLY: "months",
      YEARLY: "years",
    };
    description = `Every ${data.interval} ${unitMap[data.frequency]}`;
  }

  // Day specification
  if (data.frequency === "WEEKLY" && data.weekDays.length > 0) {
    const dayNames = data.weekDays.map((d) => WEEKDAY_NAMES[d]).join(", ");
    description += ` on ${dayNames}`;
  } else if (data.frequency === "MONTHLY") {
    if (data.monthWeekDay) {
      const ordinal = ORDINAL_NAMES[data.monthWeekDay.week] || `${data.monthWeekDay.week}th`;
      const dayName = WEEKDAY_NAMES[data.monthWeekDay.day];
      description += ` on the ${ordinal} ${dayName}`;
    } else if (data.monthDay) {
      description += ` on day ${data.monthDay}`;
    }
  }

  // End condition
  if (data.endType === "count" && data.endCount) {
    description += `, ${data.endCount} times`;
  }

  return description;
}

/**
 * Generate recurrence presets based on a given date
 */
export function getRecurrencePresets(date: Date): RecurrencePreset[] {
  const dayOfWeek = getDay(date);
  const dayAbbr = WEEKDAY_MAP[dayOfWeek];
  const dayName = WEEKDAY_NAMES[dayAbbr];
  const dayOfMonth = date.getDate();

  // Calculate which week of the month (1st, 2nd, 3rd, 4th, or last)
  const weekOfMonth = Math.ceil(dayOfMonth / 7);
  const ordinal = ORDINAL_NAMES[weekOfMonth] || `${weekOfMonth}th`;

  return [
    {
      id: "weekly",
      label: `Every week on ${dayName}`,
      rrule: `FREQ=WEEKLY;BYDAY=${dayAbbr}`,
    },
    {
      id: "biweekly",
      label: `Every 2 weeks on ${dayName}`,
      rrule: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${dayAbbr}`,
    },
    {
      id: "monthly-weekday",
      label: `Monthly on the ${ordinal} ${dayName}`,
      rrule: `FREQ=MONTHLY;BYDAY=${weekOfMonth}${dayAbbr}`,
    },
    {
      id: "monthly-day",
      label: `Monthly on day ${dayOfMonth}`,
      rrule: `FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}`,
    },
  ];
}

/**
 * Get the day abbreviation for a date
 */
export function getDayAbbreviation(date: Date): string {
  return WEEKDAY_MAP[getDay(date)];
}

/**
 * Get the week of month for a date (1-5)
 */
export function getWeekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

/**
 * Check if two RRULE strings are equivalent
 */
export function areRRulesEqual(rrule1: string, rrule2: string): boolean {
  const data1 = parseRRule(rrule1);
  const data2 = parseRRule(rrule2);

  return (
    data1.frequency === data2.frequency &&
    data1.interval === data2.interval &&
    JSON.stringify(data1.weekDays.sort()) === JSON.stringify(data2.weekDays.sort()) &&
    data1.monthDay === data2.monthDay &&
    JSON.stringify(data1.monthWeekDay) === JSON.stringify(data2.monthWeekDay)
  );
}

/**
 * Validate an RRULE string
 */
export function isValidRRule(rrule: string): boolean {
  if (!rrule) return false;

  const parts = rrule.split(";");
  const hasFreq = parts.some((p) => p.startsWith("FREQ="));

  if (!hasFreq) return false;

  // Check each part is valid
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!key || !value) return false;

    switch (key) {
      case "FREQ":
        if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(value)) {
          return false;
        }
        break;
      case "INTERVAL":
        if (isNaN(parseInt(value, 10)) || parseInt(value, 10) < 1) {
          return false;
        }
        break;
      case "BYDAY":
        // Can be simple (TU,TH) or positional (2TU)
        const days = value.split(",");
        for (const d of days) {
          if (!/^(-?\d)?[A-Z]{2}$/.test(d)) {
            return false;
          }
        }
        break;
      case "BYMONTHDAY":
        const day = parseInt(value, 10);
        if (isNaN(day) || day < 1 || day > 31) {
          return false;
        }
        break;
      case "COUNT":
        if (isNaN(parseInt(value, 10)) || parseInt(value, 10) < 1) {
          return false;
        }
        break;
      case "UNTIL":
        // UNTIL should be a valid date - we accept ISO format
        if (isNaN(Date.parse(value))) {
          return false;
        }
        break;
      default:
        // Unknown key - could be valid RFC 5545 but not supported
        break;
    }
  }

  return true;
}

/**
 * Get a short label for an RRULE (for display in lists)
 */
export function getShortRRuleLabel(rrule: string): string {
  if (!rrule) return "";

  const data = parseRRule(rrule);

  if (data.frequency === "WEEKLY") {
    if (data.interval === 1) {
      if (data.weekDays.length === 1) {
        return `Weekly on ${WEEKDAY_NAMES[data.weekDays[0]]}`;
      }
      return "Weekly";
    }
    return `Every ${data.interval} weeks`;
  }

  if (data.frequency === "MONTHLY") {
    if (data.monthWeekDay) {
      const ordinal = ORDINAL_NAMES[data.monthWeekDay.week] || `${data.monthWeekDay.week}th`;
      return `${ordinal} ${WEEKDAY_NAMES[data.monthWeekDay.day]}`;
    }
    if (data.monthDay) {
      return `Day ${data.monthDay} monthly`;
    }
    return "Monthly";
  }

  if (data.frequency === "DAILY") {
    return data.interval === 1 ? "Daily" : `Every ${data.interval} days`;
  }

  if (data.frequency === "YEARLY") {
    return "Yearly";
  }

  return "Repeating";
}
