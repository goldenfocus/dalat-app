/** Only full, unambiguous dates are evidence. All calendar dates are in Da Lat. */
export const SOURCE = {
  id: "social-house-language-exchange",
  folderId: "1Gwkv7ht3evXGMkwkT8W8E9YOZwgzDt_y",
  venueId: "436f8b46-d5fe-41ef-8245-e8ffb9ee7980",
  seriesId: "ad0a0c5e-f718-447c-89f1-6fa3b78e3c52",
} as const;
export interface PhotoEvent {
  id: string; starts_at: string; ends_at: string | null;
  venue_id: string | null; series_id: string | null; status: string;
  created_by: string; slug: string;
}
const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });
export const dayInDaLat = (iso: string) => localDay.format(new Date(iso));
function validDay(year: string, month: string, day: string): string | null {
  const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
export function datesInName(name: string): string[] {
  const dates = new Set<string>();
  for (const m of name.matchAll(/(?<!\d)((?:19|20)\d{2})[-_. /](\d{1,2})[-_. /](\d{1,2})(?!\d)/g)) {
    const d = validDay(m[1], m[2], m[3]); if (d) dates.add(d);
  }
  for (const m of name.matchAll(/(?<!\d)(\d{1,2})[-_. /](\d{1,2})[-_. /]((?:19|20)\d{2})(?!\d)/g)) {
    const d = validDay(m[3], m[2], m[1]); if (d) dates.add(d);
  }
  for (const m of name.matchAll(/(?<!\d)((?:19|20)\d{2})(\d{2})(\d{2})(?!\d)/g)) {
    const d = validDay(m[1], m[2], m[3]); if (d) dates.add(d);
  }
  return [...dates];
}
/** Drive/EXIF timestamps without an offset are camera-local time, never UTC. */
export function captureTime(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!match || !validDay(match[1], match[2], match[3]) || +match[4] > 23 || +match[5] > 59 || +match[6] > 59) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7] || ""}${match[8] || "+07:00"}`;
  const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
export type Match = { event: PhotoEvent; day: string; capturedAt: string | null } | { reason: string };
export function matchPhoto(names: string[], captured: string | null, events: PhotoEvent[], now = new Date()): Match {
  const dates = new Set(names.flatMap(datesInName));
  if (captured) dates.add(dayInDaLat(captured));
  if (!dates.size) return { reason: "No complete date in folder, filename, or capture metadata" };
  if (dates.size !== 1) return { reason: "Conflicting dates; manual review required" };
  const day = [...dates][0];
  const matches = events.filter(e => e.venue_id === SOURCE.venueId && e.series_id === SOURCE.seriesId && e.status === "published" && dayInDaLat(e.starts_at) === day);
  if (matches.length !== 1) return { reason: matches.length ? "Multiple events on this date" : "No published Social House language exchange on this date" };
  const event = matches[0];
  const end = event.ends_at || new Date(Date.parse(event.starts_at) + 4 * 3600000).toISOString();
  if (Date.parse(end) > now.getTime()) return { reason: "Event has not ended yet" };
  return { event, day, capturedAt: captured };
}
