const dalatOffset = 7 * 60 * 60 * 1000;
export const dayLength = 24 * 60 * 60 * 1000;
export const halfHour = 30 * 60 * 1000;
export const dalatZone = "Asia/Ho_Chi_Minh";

export function dayKey(timestamp: number) {
  return new Date(timestamp + dalatOffset).toISOString().slice(0, 10);
}

export function dalatDate(day: string) {
  return new Date(day + "T00:00:00+07:00");
}

export function weekDays(today: string, week: number) {
  const start = dalatDate(today).getTime() + week * 7 * dayLength;
  return Array.from({ length: 7 }, (_, index) => dayKey(start + index * dayLength));
}

export function viewingCalendar(month: string) {
  const [year, number] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, number - 1, 1));
  const padding = (start.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { padding, days: Array.from({ length: days }, (_, index) =>
    month + "-" + String(index + 1).padStart(2, "0")) };
}

export function availabilityTimes(days: string[], start: number, end: number, now = Date.now()) {
  if (days.length > 31 || !Number.isInteger(start) || !Number.isInteger(end) || start < 16 || end > 47 || start >= end) return [];
  const validDays = [...new Set(days)].filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(dalatDate(day).getTime()) && dayKey(dalatDate(day).getTime()) === day &&
    dalatDate(day).getTime() <= now + 180 * dayLength);
  return validDays.flatMap(day => Array.from({ length: end - start }, (_, index) =>
    dalatDate(day).getTime() + (start + index) * halfHour))
    .filter(at => at > now).map(at => new Date(at).toISOString());
}
