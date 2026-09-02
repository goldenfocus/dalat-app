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
  recurring: string;
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

type ActivityDescriptionFacts = Pick<
  ExtractedActivity,
  | "title"
  | "kind"
  | "startsAt"
  | "endsAt"
  | "timePrecision"
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
    sentences.push(interpolate(copy.recurring, { ...values, start, end }));
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
  sentences.push(interpolate(copy.source, values));

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

export async function upsertActivityEventTranslations(
  supabase: SupabaseClient,
  eventIds: string[],
  activity: ExtractedActivity,
  sourceName: string,
): Promise<void> {
  if (eventIds.length === 0) return;
  const rows = eventIds.flatMap((eventId) =>
    LOCALES.flatMap((locale) => [
      {
        content_type: "event",
        content_id: eventId,
        source_locale: "vi",
        target_locale: locale,
        field_name: "title",
        translated_text: activity.title,
        translation_status: "auto",
      },
      {
        content_type: "event",
        content_id: eventId,
        source_locale: "vi",
        target_locale: locale,
        field_name: "description",
        translated_text: activityDescriptionForLocale(
          locale,
          activity,
          sourceName,
        ),
        translation_status: "auto",
      },
    ]),
  );
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
  return activityDescriptionForLocale("vi", activity, sourceName);
}
