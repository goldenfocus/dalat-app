/**
 * Helpers for propagating a source-side date/time change onto an already
 * published event: detect the change, rewrite date mentions in copy and
 * slugs, and log the change so Review's post-publish check can verify it.
 */

const DALAT_TZ = "Asia/Ho_Chi_Minh";
const MAX_LOGGED_CHANGES = 20;

export const POST_PUBLISH_REVIEW_KEY = "post_publish_review";
export const SCHEDULE_CHANGES_KEY = "schedule_changes";

export interface ScheduleWindow {
  startsAt: string | null | undefined;
  endsAt: string | null | undefined;
}

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** True when the start or end moved by at least a minute. */
export function scheduleChanged(
  previous: ScheduleWindow,
  next: ScheduleWindow,
): boolean {
  const prevStart = toMs(previous.startsAt);
  const nextStart = toMs(next.startsAt);
  if (prevStart === null || nextStart === null) return false;
  if (Math.abs(prevStart - nextStart) >= 60_000) return true;
  const prevEnd = toMs(previous.endsAt);
  const nextEnd = toMs(next.endsAt);
  if (prevEnd === null || nextEnd === null) return false;
  return Math.abs(prevEnd - nextEnd) >= 60_000;
}

export function localDalatDate(iso: string): LocalDate | null {
  const ms = toMs(iso);
  if (ms === null) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DALAT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite mentions of the old local (Đà Lạt) calendar date to the new one.
 * Covers the formats our Vietnamese and English copy uses: 20/11/2026, 20/11,
 * 20.11.2026, 20-11-2026, "ngày 20 tháng 11", "20 tháng 11", "November 20",
 * "20 November", "Nov 20". Times are left alone; callers that know the time
 * changed should regenerate the copy instead.
 */
export function rewriteDateMentions(
  text: string,
  oldIso: string,
  newIso: string,
): string {
  const from = localDalatDate(oldIso);
  const to = localDalatDate(newIso);
  if (!from || !to || !text) return text;
  if (from.year === to.year && from.month === to.month && from.day === to.day) {
    return text;
  }
  let out = text;
  const numeric = (day: number, month: number) =>
    new RegExp(
      `(?<!\\d)0?${day}([/.\\-])0?${month}(?:\\1(\\d{4}))?(?!\\d)`,
      "g",
    );
  out = out.replace(numeric(from.day, from.month), (_match, sep, year) => {
    const y = year
      ? `${sep}${year === String(from.year) ? to.year : year}`
      : "";
    return `${pad(to.day)}${sep}${pad(to.month)}${y}`;
  });
  out = out.replace(
    new RegExp(
      `(?<!\\d)0?${from.day}(\\s+tháng\\s+)0?${from.month}(?!\\d)`,
      "giu",
    ),
    (_match, middle) => `${to.day}${middle}${to.month}`,
  );
  const fromName = MONTHS_EN[from.month - 1];
  const toName = MONTHS_EN[to.month - 1];
  const nameAlt = `${escapeRegExp(fromName)}|${escapeRegExp(fromName.slice(0, 3))}\\.?`;
  out = out.replace(
    new RegExp(`\\b(${nameAlt})(\\s+)0?${from.day}(?!\\d)(st|nd|rd|th)?`, "g"),
    (_match, name: string, space: string) =>
      `${name.length <= 4 ? toName.slice(0, 3) + (name.endsWith(".") ? "." : "") : toName}${space}${to.day}`,
  );
  out = out.replace(
    new RegExp(`(?<!\\d)0?${from.day}(st|nd|rd|th)?(\\s+)(${nameAlt})\\b`, "g"),
    (_match, _suffix, space: string, name: string) =>
      `${to.day}${space}${name.length <= 4 ? toName.slice(0, 3) + (name.endsWith(".") ? "." : "") : toName}`,
  );
  return out;
}

/**
 * Return a slug with its embedded date moved, or null when the slug carries
 * no recognisable date (then the slug must stay as is). Supports
 * yyyy-mm-dd, dd-mm-yyyy and ddmmyyyy forms.
 */
export function rewriteSlugDate(
  slug: string,
  oldIso: string,
  newIso: string,
): string | null {
  const from = localDalatDate(oldIso);
  const to = localDalatDate(newIso);
  if (!from || !to) return null;
  const forms: Array<[string, string]> = [
    [
      `${from.year}-${pad(from.month)}-${pad(from.day)}`,
      `${to.year}-${pad(to.month)}-${pad(to.day)}`,
    ],
    [
      `${pad(from.day)}-${pad(from.month)}-${from.year}`,
      `${pad(to.day)}-${pad(to.month)}-${to.year}`,
    ],
    [
      `${pad(from.day)}${pad(from.month)}${from.year}`,
      `${pad(to.day)}${pad(to.month)}${to.year}`,
    ],
  ];
  for (const [oldForm, newForm] of forms) {
    const re = new RegExp(`(^|[^0-9])${oldForm}(?=$|[^0-9])`);
    if (re.test(slug)) {
      if (oldForm === newForm) return null;
      return slug.replace(re, (_match, lead) => `${lead}${newForm}`);
    }
  }
  return null;
}

/**
 * Append a schedule change to the event's metadata log and flag the event for
 * Review's post-publish check. Never touches status.
 */
export function withScheduleChangeLog(
  metadata: Record<string, unknown>,
  change: {
    from: ScheduleWindow;
    to: ScheduleWindow;
    detectedAt: string;
    sourceUrl: string | null;
    detector: string;
  },
): Record<string, unknown> {
  const previous = Array.isArray(metadata[SCHEDULE_CHANGES_KEY])
    ? (metadata[SCHEDULE_CHANGES_KEY] as unknown[])
    : [];
  const entry = {
    from_starts_at: change.from.startsAt ?? null,
    from_ends_at: change.from.endsAt ?? null,
    to_starts_at: change.to.startsAt ?? null,
    to_ends_at: change.to.endsAt ?? null,
    detected_at: change.detectedAt,
    source_url: change.sourceUrl,
    detector: change.detector,
  };
  return {
    ...metadata,
    [SCHEDULE_CHANGES_KEY]: [...previous, entry].slice(-MAX_LOGGED_CHANGES),
    [POST_PUBLISH_REVIEW_KEY]: {
      reason: "source_schedule_changed",
      requested_at: change.detectedAt,
      detector: change.detector,
      from_starts_at: entry.from_starts_at,
      to_starts_at: entry.to_starts_at,
    },
  };
}
