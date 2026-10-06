import { batchTranslateFields, translateFieldsToLocale } from "@/lib/google-translate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSeries } from "@/lib/types";
import type { ExtractedActivity } from "./types";

const LOCALES = [
  "en",
  "vi",
  "ko",
  "zh",
  "ru",
  "fr",
  "ja",
  "ms",
  "th",
  "de",
  "es",
  "id",
] as const;

type ActivityLocale = (typeof LOCALES)[number];

const INTL_LOCALES: Record<ActivityLocale, string> = {
  en: "en-US",
  vi: "vi-VN",
  ko: "ko-KR",
  zh: "zh-CN",
  ru: "ru-RU",
  fr: "fr-FR",
  ja: "ja-JP",
  ms: "ms-MY",
  th: "th-TH",
  de: "de-DE",
  es: "es-ES",
  id: "id-ID",
};

interface ActivityCopy {
  dated: string;
  datedStart: string;
  /** FREQ=DAILY only. */
  recurring: string;
  /** FREQ=WEEKLY with BYDAY; {days} is a localized weekday list. */
  recurringWeekly: string;
  /** Any other or unknown cadence. Never claim "daily" without evidence. */
  recurringRegular: string;
  reservationRequired: string;
  reservationRecommended: string;
  noCover: string;
  rainSuitable: string;
  source: string;
}

const COPY: Record<ActivityLocale, ActivityCopy> = {
  en: {
    dated: "{title} takes place at {venue} on {date}, from {start} to {end}.",
    datedStart: "{title} takes place at {venue} on {date} at {start}.",
    recurring: "{title} runs daily at {venue}, from {start} to {end}.",
    recurringWeekly: "{title} runs every {days} at {venue}, from {start} to {end}.",
    recurringRegular: "{title} runs regularly at {venue}, from {start} to {end}.",
    reservationRequired: "Advance booking is required.",
    reservationRecommended: "Booking ahead is recommended at busy times.",
    noCover:
      "The official listing states that there is no ticket or cover charge.",
    rainSuitable:
      "Rain does not cancel the activity; it moves indoors when needed.",
    source:
      "Verified from {source}; check the official page for availability and last-minute changes.",
  },
  vi: {
    dated: "{title} diễn ra tại {venue} vào {date}, từ {start} đến {end}.",
    datedStart: "{title} diễn ra tại {venue} vào {date} lúc {start}.",
    recurring: "{title} diễn ra hằng ngày tại {venue}, từ {start} đến {end}.",
    recurringWeekly: "{title} diễn ra vào {days} hằng tuần tại {venue}, từ {start} đến {end}.",
    recurringRegular: "{title} diễn ra định kỳ tại {venue}, từ {start} đến {end}.",
    reservationRequired: "Cần đặt chỗ trước.",
    reservationRecommended: "Nên đặt chỗ trước vào thời điểm đông khách.",
    noCover: "Nguồn chính thức cho biết không cần vé và không thu phí vào cửa.",
    rainSuitable:
      "Hoạt động không bị hủy khi trời mưa và sẽ chuyển vào trong nhà khi cần.",
    source:
      "Đã xác minh từ {source}; hãy kiểm tra trang chính thức để biết chỗ còn trống và thay đổi mới nhất.",
  },
  ko: {
    dated: "{title}은(는) {date} {start}부터 {end}까지 {venue}에서 열립니다.",
    datedStart: "{title}은(는) {date} {start}에 {venue}에서 열립니다.",
    recurring:
      "{title}은(는) 매일 {start}부터 {end}까지 {venue}에서 진행됩니다.",
    recurringWeekly: "{title}은(는) 매주 {days} {start}부터 {end}까지 {venue}에서 진행됩니다.",
    recurringRegular: "{title}은(는) 정기적으로 {start}부터 {end}까지 {venue}에서 진행됩니다.",
    reservationRequired: "사전 예약이 필요합니다.",
    reservationRecommended: "혼잡한 시기에는 미리 예약하는 것이 좋습니다.",
    noCover: "공식 안내에는 티켓이나 입장료가 없다고 명시되어 있습니다.",
    rainSuitable: "비가 와도 취소되지 않으며 필요하면 실내로 이동합니다.",
    source:
      "{source}에서 확인했습니다. 잔여석과 막바지 변경 사항은 공식 페이지를 확인하세요.",
  },
  zh: {
    dated: "{title}将于{date}{start}至{end}在{venue}举行。",
    datedStart: "{title}将于{date}{start}在{venue}举行。",
    recurring: "{title}每天{start}至{end}在{venue}举行。",
    recurringWeekly: "{title}每周{days}{start}至{end}在{venue}举行。",
    recurringRegular: "{title}定期于{start}至{end}在{venue}举行。",
    reservationRequired: "需要提前预订。",
    reservationRecommended: "繁忙时段建议提前预订。",
    noCover: "官方信息注明无需门票或入场费。",
    rainSuitable: "下雨不会取消活动，必要时会移至室内。",
    source: "信息已从{source}核实；余位和临时变更请查看官方页面。",
  },
  ru: {
    dated: "{title} состоится {date} в {venue}, с {start} до {end}.",
    datedStart: "{title} состоится {date} в {start} в {venue}.",
    recurring: "{title} проходит ежедневно в {venue}, с {start} до {end}.",
    recurringWeekly: "{title} проходит еженедельно ({days}) в {venue}, с {start} до {end}.",
    recurringRegular: "{title} проходит регулярно в {venue}, с {start} до {end}.",
    reservationRequired: "Требуется предварительное бронирование.",
    reservationRecommended: "В загруженные дни лучше бронировать заранее.",
    noCover:
      "В официальном источнике указано, что билет и плата за вход не требуются.",
    rainSuitable:
      "Дождь не отменяет мероприятие: при необходимости оно проходит в помещении.",
    source:
      "Проверено по {source}; наличие мест и срочные изменения смотрите на официальной странице.",
  },
  fr: {
    dated: "{title} a lieu à {venue} le {date}, de {start} à {end}.",
    datedStart: "{title} a lieu à {venue} le {date} à {start}.",
    recurring: "{title} a lieu chaque jour à {venue}, de {start} à {end}.",
    recurringWeekly: "{title} a lieu chaque semaine ({days}) à {venue}, de {start} à {end}.",
    recurringRegular: "{title} a lieu régulièrement à {venue}, de {start} à {end}.",
    reservationRequired: "La réservation à l’avance est obligatoire.",
    reservationRecommended:
      "Il est conseillé de réserver pendant les périodes chargées.",
    noCover:
      "La source officielle indique qu’il n’y a ni billet ni droit d’entrée.",
    rainSuitable:
      "La pluie n’annule pas l’activité, qui se déplace à l’intérieur si nécessaire.",
    source:
      "Vérifié auprès de {source} ; consultez la page officielle pour les disponibilités et changements de dernière minute.",
  },
  ja: {
    dated: "{title}は{date}の{start}から{end}まで{venue}で開催されます。",
    datedStart: "{title}は{date}の{start}に{venue}で開催されます。",
    recurring: "{title}は毎日{start}から{end}まで{venue}で開催されます。",
    recurringWeekly: "{title}は毎週{days}の{start}から{end}まで{venue}で開催されます。",
    recurringRegular: "{title}は定期的に{start}から{end}まで{venue}で開催されます。",
    reservationRequired: "事前予約が必要です。",
    reservationRecommended: "混雑時は事前予約をおすすめします。",
    noCover: "公式情報ではチケットも入場料も不要と案内されています。",
    rainSuitable: "雨でも中止されず、必要に応じて屋内で行われます。",
    source:
      "{source}で確認済みです。空き状況や直前の変更は公式ページをご確認ください。",
  },
  ms: {
    dated:
      "{title} berlangsung di {venue} pada {date}, dari {start} hingga {end}.",
    datedStart: "{title} berlangsung di {venue} pada {date} jam {start}.",
    recurring:
      "{title} berlangsung setiap hari di {venue}, dari {start} hingga {end}.",
    recurringWeekly: "{title} berlangsung setiap minggu ({days}) di {venue}, dari {start} hingga {end}.",
    recurringRegular: "{title} berlangsung secara berkala di {venue}, dari {start} hingga {end}.",
    reservationRequired: "Tempahan awal diperlukan.",
    reservationRecommended: "Tempahan awal disyorkan ketika waktu sibuk.",
    noCover: "Sumber rasmi menyatakan tiada tiket atau caj masuk.",
    rainSuitable:
      "Hujan tidak membatalkan aktiviti; ia dipindahkan ke dalam bangunan jika perlu.",
    source:
      "Disahkan daripada {source}; semak halaman rasmi untuk kekosongan dan perubahan saat akhir.",
  },
  th: {
    dated: "{title} จัดที่ {venue} วันที่ {date} เวลา {start}–{end}",
    datedStart: "{title} จัดที่ {venue} วันที่ {date} เวลา {start}",
    recurring: "{title} จัดทุกวันที่ {venue} เวลา {start}–{end}",
    recurringWeekly: "{title} จัดทุกสัปดาห์ ({days}) ที่ {venue} เวลา {start}–{end}",
    recurringRegular: "{title} จัดเป็นประจำที่ {venue} เวลา {start}–{end}",
    reservationRequired: "ต้องจองล่วงหน้า",
    reservationRecommended: "แนะนำให้จองล่วงหน้าในช่วงที่มีผู้ใช้บริการมาก",
    noCover: "แหล่งข้อมูลทางการระบุว่าไม่ต้องใช้บัตรและไม่มีค่าเข้าชม",
    rainSuitable: "ฝนไม่ทำให้กิจกรรมยกเลิก และจะย้ายเข้าอาคารเมื่อจำเป็น",
    source:
      "ตรวจสอบจาก {source} แล้ว โปรดดูหน้าทางการสำหรับที่ว่างและการเปลี่ยนแปลงล่าสุด",
  },
  de: {
    dated: "{title} findet am {date} von {start} bis {end} im {venue} statt.",
    datedStart: "{title} findet am {date} um {start} im {venue} statt.",
    recurring: "{title} findet täglich von {start} bis {end} im {venue} statt.",
    recurringWeekly: "{title} findet wöchentlich ({days}) von {start} bis {end} im {venue} statt.",
    recurringRegular: "{title} findet regelmäßig von {start} bis {end} im {venue} statt.",
    reservationRequired: "Eine Vorabreservierung ist erforderlich.",
    reservationRecommended:
      "Zu gut besuchten Zeiten wird eine Reservierung empfohlen.",
    noCover:
      "Laut offizieller Quelle sind weder Ticket noch Eintrittsgebühr nötig.",
    rainSuitable:
      "Regen führt nicht zur Absage; bei Bedarf findet die Aktivität drinnen statt.",
    source:
      "Bei {source} geprüft; Verfügbarkeit und kurzfristige Änderungen stehen auf der offiziellen Seite.",
  },
  es: {
    dated: "{title} se celebra en {venue} el {date}, de {start} a {end}.",
    datedStart: "{title} se celebra en {venue} el {date} a las {start}.",
    recurring:
      "{title} se celebra todos los días en {venue}, de {start} a {end}.",
    recurringWeekly: "{title} se celebra cada semana ({days}) en {venue}, de {start} a {end}.",
    recurringRegular: "{title} se celebra periódicamente en {venue}, de {start} a {end}.",
    reservationRequired: "Es necesario reservar con antelación.",
    reservationRecommended:
      "Se recomienda reservar en los periodos de mayor demanda.",
    noCover:
      "La fuente oficial indica que no se necesita entrada ni se cobra acceso.",
    rainSuitable:
      "La lluvia no cancela la actividad; se traslada al interior cuando es necesario.",
    source:
      "Verificado en {source}; consulta la página oficial para disponibilidad y cambios de última hora.",
  },
  id: {
    dated: "{title} berlangsung di {venue} pada {date}, pukul {start}–{end}.",
    datedStart: "{title} berlangsung di {venue} pada {date} pukul {start}.",
    recurring:
      "{title} berlangsung setiap hari di {venue}, pukul {start}–{end}.",
    recurringWeekly: "{title} berlangsung setiap minggu ({days}) di {venue}, pukul {start}–{end}.",
    recurringRegular: "{title} berlangsung secara berkala di {venue}, pukul {start}–{end}.",
    reservationRequired: "Reservasi sebelumnya diperlukan.",
    reservationRecommended: "Reservasi lebih awal disarankan saat ramai.",
    noCover: "Sumber resmi menyatakan tidak ada tiket atau biaya masuk.",
    rainSuitable:
      "Hujan tidak membatalkan kegiatan; acara dipindahkan ke dalam ruangan bila perlu.",
    source:
      "Diverifikasi dari {source}; periksa halaman resmi untuk ketersediaan dan perubahan mendadak.",
  },
};

function supportedLocale(locale: string): ActivityLocale {
  return LOCALES.includes(locale as ActivityLocale)
    ? (locale as ActivityLocale)
    : "en";
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function clock(value: string, locale: ActivityLocale): string {
  const [hour = "0", minute = "0"] = value.split(":");
  const date = new Date(Date.UTC(2026, 0, 1, Number(hour), Number(minute)));
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date);
}

function instantParts(
  activity: ActivityDescriptionFacts,
  locale: ActivityLocale,
) {
  if (!activity.startsAt) return null;
  const start = new Date(activity.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const intlLocale = INTL_LOCALES[locale];
  const date = new Intl.DateTimeFormat(intlLocale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return {
    date,
    start: timeFormatter.format(start),
    end:
      activity.endsAt && !Number.isNaN(new Date(activity.endsAt).getTime())
        ? timeFormatter.format(new Date(activity.endsAt))
        : null,
  };
}

const RRULE_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

function rruleParts(rrule: string | null | undefined): Map<string, string> {
  const parts = new Map<string, string>();
  for (const segment of (rrule ?? "").replace(/^RRULE:/i, "").split(";")) {
    const [key, value] = segment.split("=");
    if (key && value) parts.set(key.trim().toUpperCase(), value.trim().toUpperCase());
  }
  return parts;
}

/** Only an explicit FREQ=DAILY (interval 1, no BYDAY filter) may say "daily". */
export function isDailyRRule(rrule: string | null | undefined): boolean {
  const parts = rruleParts(rrule);
  return (
    parts.get("FREQ") === "DAILY" &&
    !parts.has("BYDAY") &&
    (!parts.has("INTERVAL") || parts.get("INTERVAL") === "1")
  );
}

/** Weekday codes for a plain weekly rule (interval 1), in Monday-first order. */
export function rruleWeeklyDays(
  rrule: string | null | undefined,
): Array<(typeof RRULE_WEEKDAYS)[number]> | null {
  const parts = rruleParts(rrule);
  if (parts.get("FREQ") !== "WEEKLY") return null;
  if (parts.has("INTERVAL") && parts.get("INTERVAL") !== "1") return null;
  const byDay = parts.get("BYDAY");
  if (!byDay) return null;
  const codes = byDay.split(",").map((code) => code.trim());
  if (codes.some((code) => !RRULE_WEEKDAYS.includes(code as never))) return null;
  return RRULE_WEEKDAYS.filter((code) => codes.includes(code));
}

function localizedWeekdayList(
  codes: Array<(typeof RRULE_WEEKDAYS)[number]>,
  locale: ActivityLocale,
): string {
  const formatter = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    weekday: "long",
    timeZone: "UTC",
  });
  // 2026-01-05 is a Monday.
  const names = codes.map((code) =>
    formatter.format(
      new Date(Date.UTC(2026, 0, 5 + RRULE_WEEKDAYS.indexOf(code))),
    ),
  );
  try {
    return new Intl.ListFormat(INTL_LOCALES[locale], {
      style: "long",
      type: "conjunction",
    }).format(names);
  } catch {
    return names.join(", ");
  }
}

type ActivityDescriptionFacts = Pick<
  ExtractedActivity,
  | "title"
  | "kind"
  | "startsAt"
  | "endsAt"
  | "timePrecision"
  | "rrule"
  | "startsAtTime"
  | "durationMinutes"
  | "locationName"
  | "address"
  | "reservationRequirement"
  | "attributes"
>;

export function activityDescriptionForLocale(
  locale: string,
  activity: ActivityDescriptionFacts,
  sourceName: string,
): string {
  const selected = supportedLocale(locale);
  const copy = COPY[selected];
  const venue = activity.locationName || activity.address || "Đà Lạt";
  const values = { title: activity.title, venue, source: sourceName };
  const sentences: string[] = [];

  if (activity.kind === "recurring_activity" && activity.startsAtTime) {
    const start = clock(activity.startsAtTime, selected);
    const endMinutes =
      Number(activity.startsAtTime.slice(0, 2)) * 60 +
      Number(activity.startsAtTime.slice(3, 5)) +
      (activity.durationMinutes ?? 0);
    const end = clock(
      `${String(Math.floor((endMinutes / 60) % 24)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}:00`,
      selected,
    );
    const weekdays = rruleWeeklyDays(activity.rrule);
    if (isDailyRRule(activity.rrule)) {
      sentences.push(interpolate(copy.recurring, { ...values, start, end }));
    } else if (weekdays) {
      sentences.push(
        interpolate(copy.recurringWeekly, {
          ...values,
          start,
          end,
          days: localizedWeekdayList(weekdays, selected),
        }),
      );
    } else {
      sentences.push(
        interpolate(copy.recurringRegular, { ...values, start, end }),
      );
    }
  } else {
    const parts = instantParts(activity, selected);
    if (parts) {
      sentences.push(
        interpolate(
          activity.timePrecision === "tba"
            ? copy.datedStart
            : parts.end
              ? copy.dated
              : copy.datedStart,
          {
            ...values,
            date: parts.date,
            start: activity.timePrecision === "tba" ? "TBD" : parts.start,
            end: activity.timePrecision === "tba" ? "" : (parts.end ?? ""),
          },
        ),
      );
    }
  }

  if (activity.reservationRequirement === "required") {
    sentences.push(copy.reservationRequired);
  } else if (activity.reservationRequirement === "recommended") {
    sentences.push(copy.reservationRecommended);
  }
  if (activity.attributes.no_cover_charge === true) {
    sentences.push(copy.noCover);
  }
  if (activity.attributes.rain_suitable === true) {
    sentences.push(copy.rainSuitable);
  }
  // Source attribution is rendered separately in the event footer.

  return sentences.join(" ");
}

function seriesActivityAttributes(
  sourceMetadata: Record<string, unknown> | null | undefined,
): Record<string, boolean | string | number | null> {
  const value = sourceMetadata?.activity_attributes;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry) => {
      const item = entry[1];
      return (
        item === null ||
        typeof item === "boolean" ||
        typeof item === "string" ||
        typeof item === "number"
      );
    }),
  ) as Record<string, boolean | string | number | null>;
}

export function activitySeriesDescriptionForLocale(
  locale: string,
  series: Pick<
    EventSeries,
    | "title"
    | "rrule"
    | "starts_at_time"
    | "duration_minutes"
    | "location_name"
    | "address"
    | "reservation_requirement"
    | "source_metadata"
  >,
  sourceName: string,
): string {
  return activityDescriptionForLocale(
    locale,
    {
      title: series.title,
      kind: "recurring_activity",
      startsAt: null,
      endsAt: null,
      timePrecision: "recurring",
      rrule: series.rrule,
      startsAtTime: series.starts_at_time,
      durationMinutes: series.duration_minutes,
      locationName: series.location_name,
      address: series.address,
      reservationRequirement: series.reservation_requirement ?? null,
      attributes: seriesActivityAttributes(series.source_metadata),
    },
    sourceName,
  );
}

const PROPER_NAME_MIN_LENGTH = 3;

/** Replace venue and business names with stable tokens the translator must keep. */
export function shieldProperNames(
  text: string,
  names: Array<string | null | undefined>,
): { text: string; names: string[] } {
  const unique = [
    ...new Set(
      names
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name && name.length >= PROPER_NAME_MIN_LENGTH)),
    ),
  ].sort((a, b) => b.length - a.length);
  const protectedNames: string[] = [];
  let shielded = text;
  for (const name of unique) {
    if (!shielded.includes(name)) continue;
    const token = `⟦${protectedNames.length}⟧`;
    shielded = shielded.split(name).join(token);
    protectedNames.push(name);
  }
  return { text: shielded, names: protectedNames };
}

/** Restore shielded names. Null when the model dropped a token. */
export function restoreProperNames(
  text: string | null | undefined,
  names: string[],
): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  let restored = text;
  for (let index = 0; index < names.length; index += 1) {
    const token = `⟦${index}⟧`;
    if (!restored.includes(token)) return null;
    restored = restored.split(token).join(names[index]);
  }
  return restored.trim();
}

function activityProperNames(
  activity: Pick<ExtractedActivity, "locationName" | "organizerName" | "address">,
  sourceName: string,
): Array<string | null | undefined> {
  return [activity.locationName, activity.organizerName, activity.address, sourceName];
}

function droppedProperName(
  source: string,
  translated: string | null | undefined,
  names: Array<string | null | undefined>,
): boolean {
  if (!translated?.trim()) return false;
  return names.some((name) => {
    const trimmed = name?.trim();
    return Boolean(
      trimmed &&
        trimmed.length >= PROPER_NAME_MIN_LENGTH &&
        source.includes(trimmed) &&
        !translated.includes(trimmed),
    );
  });
}

interface StoredActivityTranslation {
  content_id: string;
  target_locale: string;
  field_name: string;
  translated_text: string | null;
  translation_status: string | null;
}

async function loadStoredActivityTranslations(
  supabase: SupabaseClient,
  eventIds: string[],
): Promise<Map<string, StoredActivityTranslation[]>> {
  const byEvent = new Map<string, StoredActivityTranslation[]>();
  if (eventIds.length === 0) return byEvent;
  const { data, error } = await supabase
    .from("content_translations")
    .select("content_id, target_locale, field_name, translated_text, translation_status")
    .eq("content_type", "event")
    .in("content_id", eventIds)
    .in("field_name", ["title", "description"]);
  if (error) {
    throw new Error(`Activity translation lookup failed: ${error.message}`);
  }
  for (const row of data ?? []) {
    const list = byEvent.get(row.content_id) ?? [];
    list.push(row as StoredActivityTranslation);
    byEvent.set(row.content_id, list);
  }
  return byEvent;
}

/** Backward-compatible export used by small translation diagnostics. */
export function sourceDescriptionForLocale(
  locale: string,
  sourceName: string,
  activity?: ExtractedActivity,
): string {
  if (activity) {
    return activityDescriptionForLocale(locale, activity, sourceName);
  }
  const selected = supportedLocale(locale);
  return interpolate(COPY[selected].source, { source: sourceName });
}

const SOURCE_LOCALE = "vi";

function storedField(
  rows: StoredActivityTranslation[],
  locale: string,
  field: string,
): StoredActivityTranslation | undefined {
  return rows.find((row) => row.target_locale === locale && row.field_name === field);
}

/**
 * Hourly Activity Graph refreshes call this for the same events. Write a cell
 * only when it is blank, the source text changed, or an automatic translation
 * dropped a proper name that is still in the source. Reviewed rows stay put.
 */
export function activityTranslationCellNeedsWrite(options: {
  sourceChanged: boolean;
  sourceText: string;
  existing: Pick<StoredActivityTranslation, "translated_text" | "translation_status"> | undefined;
  properNames: Array<string | null | undefined>;
}): boolean {
  const text = options.existing?.translated_text?.trim() ?? "";
  if (!text) return true;
  if (options.existing?.translation_status && options.existing.translation_status !== "auto") {
    return false;
  }
  if (options.sourceChanged) return true;
  return droppedProperName(options.sourceText, text, options.properNames);
}

export async function upsertActivityEventTranslations(
  supabase: SupabaseClient,
  eventIds: string[],
  activity: ExtractedActivity,
  sourceName: string,
): Promise<void> {
  if (eventIds.length === 0) return;
  const original = { title: activity.title, description: sourceDescription(activity, sourceName) };
  const names = activityProperNames(activity, sourceName);
  const existing = await loadStoredActivityTranslations(supabase, eventIds);
  const sourceChangedByEvent = new Map<string, boolean>();
  let anyWrite = false;
  for (const eventId of eventIds) {
    const rows = existing.get(eventId) ?? [];
    const title = storedField(rows, SOURCE_LOCALE, "title")?.translated_text?.trim() ?? "";
    const description = storedField(rows, SOURCE_LOCALE, "description")?.translated_text?.trim() ?? "";
    const sourceChanged =
      title !== original.title.trim() || description !== original.description.trim();
    sourceChangedByEvent.set(eventId, sourceChanged);
    const needsWrite = LOCALES.some((locale) =>
      (["title", "description"] as const).some((field) =>
        activityTranslationCellNeedsWrite({
          sourceChanged,
          sourceText: original[field],
          existing: storedField(rows, locale, field),
          properNames: names,
        }),
      ),
    );
    if (needsWrite) anyWrite = true;
  }
  if (!anyWrite) return;

  const shieldedTitle = shieldProperNames(original.title, names);
  const shieldedDescription = shieldProperNames(original.description, names);
  const shieldedFields = [
    { field_name: "title", text: shieldedTitle.text },
    { field_name: "description", text: shieldedDescription.text },
  ];
  // Establish a readable English fallback first. Using its explicit cultural
  // terms as the pivot avoids ambiguous Vietnamese festival names in other locales.
  // Proper names stay tokenized through both hops so a venue is not rewritten
  // as a literal phrase in the target language.
  const english = await translateFieldsToLocale(shieldedFields, "en");
  const englishTitle = restoreProperNames(english.title, shieldedTitle.names);
  const englishDescription = restoreProperNames(english.description, shieldedDescription.names);
  if (!englishTitle || !englishDescription) {
    const repairing = eventIds.every((eventId) =>
      LOCALES.some((locale) => storedField(existing.get(eventId) ?? [], locale, "title")?.translated_text?.trim()),
    );
    if (repairing) {
      console.warn(
        "[activity-graph] skipped translation refresh; English restore dropped a proper name",
      );
      return;
    }
    throw new Error("English activity translation is incomplete; retry before publication");
  }
  const { translations } = await batchTranslateFields(
    [
      { field_name: "title", text: shieldedTitle.text },
      { field_name: "description", text: shieldedDescription.text },
    ].map((field) =>
      field.field_name === "title"
        ? { field_name: "title", text: english.title ?? shieldedTitle.text }
        : { field_name: "description", text: english.description ?? shieldedDescription.text },
    ),
    "en",
  );
  const restored: Record<string, Record<string, string>> = {};
  for (const locale of LOCALES) {
    if (locale === SOURCE_LOCALE) {
      restored[locale] = original;
      continue;
    }
    const translated = translations[locale];
    if (!translated) continue;
    const title = restoreProperNames(translated.title, shieldedTitle.names);
    const description = restoreProperNames(translated.description, shieldedDescription.names);
    const fields: Record<string, string> = {};
    if (title) fields.title = title;
    if (description) fields.description = description;
    if (Object.keys(fields).length > 0) restored[locale] = fields;
  }
  restored.en = { title: englishTitle, description: englishDescription };

  const rows = eventIds.flatMap((eventId) => {
    const stored = existing.get(eventId) ?? [];
    const sourceChanged = sourceChangedByEvent.get(eventId) === true;
    return LOCALES.flatMap((locale) =>
      Object.entries(restored[locale] ?? {}).flatMap(([field, text]) => {
        if (
          !activityTranslationCellNeedsWrite({
            sourceChanged,
            sourceText: original[field as "title" | "description"],
            existing: storedField(stored, locale, field),
            properNames: names,
          })
        ) {
          return [];
        }
        return [{
          content_type: "event",
          content_id: eventId,
          source_locale: SOURCE_LOCALE,
          target_locale: locale,
          field_name: field,
          translated_text: text,
          translation_status: "auto",
        }];
      }),
    );
  });
  if (rows.length === 0) return;
  // Never fill failed locales with Vietnamese and mark them as translated.
  // Missing fields remain missing so the translation sweep can retry them.
  const { error } = await supabase.from("content_translations").upsert(rows, {
    onConflict: "content_type,content_id,target_locale,field_name",
  });
  if (error) {
    throw new Error(`Activity translation upsert failed: ${error.message}`);
  }
}

export function sourceDescription(
  activity: ExtractedActivity,
  sourceName: string,
): string {
  return activity.description?.trim() || activityDescriptionForLocale("vi", activity, sourceName);
}
