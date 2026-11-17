import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "@/lib/translations";
import type { ContentLocale } from "@/lib/types";

/** Reuse reviewed occurrence text only while it still matches the series source. */
export async function getSeriesTranslation(
  supabase: SupabaseClient,
  series: { id: string; title: string; description: string | null },
  locale: string,
) {
  let query = supabase
    .from("events")
    .select("id,source_locale")
    .eq("series_id", series.id)
    .eq("status", "published")
    .eq("title", series.title);
  query = series.description === null
    ? query.is("description", null)
    : query.eq("description", series.description);
  const { data: occurrence } = await query
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!occurrence) return null;
  const fields = await getTranslations("event", occurrence.id, locale as ContentLocale);
  return {
    title: fields.get("title"),
    description: fields.get("description"),
    sourceLocale: occurrence.source_locale as string | null,
  };
}

/** A weekly schedule needs only localized weekdays and a local clock range. */
export function weeklyScheduleLabel(
  rrule: string,
  startsAtTime: string,
  durationMinutes: number,
  locale: string,
): string | null {
  const rule: Record<string, string> = Object.fromEntries(rrule.split(";").map((part) => part.split("=")));
  if (rule.FREQ !== "WEEKLY" || (rule.INTERVAL && rule.INTERVAL !== "1")) return null;
  const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const days = (rule.BYDAY || "").split(",");
  if (!days.length || days.some((day) => !weekdays.includes(day))) return null;
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  const labels = days.map((day) => formatter.format(new Date(Date.UTC(2026, 10, 15 + weekdays.indexOf(day)))));
  const [hours, minutes] = startsAtTime.split(":").map(Number);
  const end = (hours * 60 + minutes + durationMinutes) % (24 * 60);
  const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  return `${labels.join(", ")} · ${startsAtTime.slice(0, 5)}–${endTime}`;
}
