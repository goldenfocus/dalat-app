import type { SupabaseClient } from "@supabase/supabase-js";

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

function officialDescription(
  locale: (typeof LOCALES)[number],
  sourceName: string,
): string {
  const descriptions: Record<(typeof LOCALES)[number], string> = {
    en: `Official activity listing from ${sourceName}. Check the source for the latest schedule, booking and access details.`,
    vi: `Thông tin hoạt động chính thức từ ${sourceName}. Xem nguồn để kiểm tra lịch, đặt chỗ và thông tin tham dự mới nhất.`,
    ko: `${sourceName}의 공식 활동 정보입니다. 최신 일정, 예약 및 입장 정보는 원문을 확인하세요.`,
    zh: `这是来自${sourceName}的官方活动信息。请查看来源以确认最新时间、预订和入场详情。`,
    ru: `Официальная информация от ${sourceName}. Проверьте источник для актуального расписания, бронирования и условий посещения.`,
    fr: `Activité officielle publiée par ${sourceName}. Consultez la source pour les horaires, réservations et conditions d’accès à jour.`,
    ja: `${sourceName}による公式アクティビティ情報です。最新の日程、予約、参加条件は情報元をご確認ください。`,
    ms: `Penyenaraian aktiviti rasmi daripada ${sourceName}. Semak sumber untuk jadual, tempahan dan maklumat kemasukan terkini.`,
    th: `ข้อมูลกิจกรรมอย่างเป็นทางการจาก ${sourceName} โปรดตรวจสอบแหล่งข้อมูลสำหรับกำหนดการ การจอง และเงื่อนไขเข้าร่วมล่าสุด`,
    de: `Offizieller Aktivitätshinweis von ${sourceName}. Aktuelle Zeiten, Buchungs- und Zugangshinweise stehen in der Quelle.`,
    es: `Actividad oficial de ${sourceName}. Consulta la fuente para ver horarios, reservas y condiciones de acceso actualizados.`,
    id: `Daftar aktivitas resmi dari ${sourceName}. Periksa sumber untuk jadwal, reservasi, dan ketentuan akses terbaru.`,
  };
  return descriptions[locale];
}

export function sourceDescriptionForLocale(
  locale: string,
  sourceName: string,
): string {
  const supportedLocale = LOCALES.includes(locale as (typeof LOCALES)[number])
    ? (locale as (typeof LOCALES)[number])
    : "en";
  return officialDescription(supportedLocale, sourceName);
}

/**
 * Proper names remain verbatim; the small factual wrapper is localized without
 * an LLM. This keeps a deterministic auto-publish from exposing untranslated
 * copied prose while the separate translation worker remains optional.
 */
export async function upsertActivityEventTranslations(
  supabase: SupabaseClient,
  eventIds: string[],
  title: string,
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
        translated_text: title,
        translation_status: "auto",
      },
      {
        content_type: "event",
        content_id: eventId,
        source_locale: "vi",
        target_locale: locale,
        field_name: "description",
        translated_text: officialDescription(locale, sourceName),
        translation_status: "auto",
      },
    ]),
  );
  const { error } = await supabase.from("content_translations").upsert(rows, {
    onConflict: "content_type,content_id,target_locale,field_name",
  });
  if (error)
    throw new Error(`Activity translation upsert failed: ${error.message}`);
}

export function sourceDescription(sourceName: string): string {
  return officialDescription("vi", sourceName);
}
