import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  MapPin,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";
import type { Locale } from "@/lib/types";

type ReservationRequirement =
  | "not_required"
  | "recommended"
  | "required"
  | "unknown"
  | null;

type PublicAccess = "confirmed" | "restricted" | "unknown" | null;

interface QuickFactsCopy {
  eyebrow: string;
  title: string;
  when: string;
  where: string;
  booking: string;
  access: string;
  lastConfirmed: string;
  officialSource: string;
  reservation: Record<
    Exclude<ReservationRequirement, "unknown" | null>,
    string
  >;
  publicAccess: Record<Exclude<PublicAccess, "unknown" | null>, string>;
}

const COPY: Record<Locale, QuickFactsCopy> = {
  en: {
    eyebrow: "Quick answer",
    title: "Plan this activity",
    when: "When",
    where: "Where",
    booking: "Booking",
    access: "Access",
    lastConfirmed: "Last confirmed",
    officialSource: "Official source",
    reservation: {
      not_required: "No reservation required",
      recommended: "Reservation recommended",
      required: "Reservation required",
    },
    publicAccess: {
      confirmed: "Public access confirmed",
      restricted: "Restricted access",
    },
  },
  vi: {
    eyebrow: "Thông tin nhanh",
    title: "Lên kế hoạch cho hoạt động này",
    when: "Khi nào",
    where: "Ở đâu",
    booking: "Đặt chỗ",
    access: "Quyền vào",
    lastConfirmed: "Xác nhận lần cuối",
    officialSource: "Nguồn chính thức",
    reservation: {
      not_required: "Không cần đặt chỗ",
      recommended: "Nên đặt chỗ",
      required: "Cần đặt chỗ",
    },
    publicAccess: {
      confirmed: "Đã xác nhận mở cửa công khai",
      restricted: "Quyền vào bị hạn chế",
    },
  },
  ko: {
    eyebrow: "빠른 정보",
    title: "활동 계획하기",
    when: "시간",
    where: "장소",
    booking: "예약",
    access: "입장",
    lastConfirmed: "최근 확인",
    officialSource: "공식 출처",
    reservation: {
      not_required: "예약 불필요",
      recommended: "예약 권장",
      required: "예약 필수",
    },
    publicAccess: {
      confirmed: "일반 입장 확인됨",
      restricted: "입장 제한",
    },
  },
  zh: {
    eyebrow: "快速信息",
    title: "规划这项活动",
    when: "时间",
    where: "地点",
    booking: "预约",
    access: "入场",
    lastConfirmed: "最近确认",
    officialSource: "官方来源",
    reservation: {
      not_required: "无需预约",
      recommended: "建议预约",
      required: "必须预约",
    },
    publicAccess: {
      confirmed: "已确认对公众开放",
      restricted: "限制入场",
    },
  },
  ru: {
    eyebrow: "Кратко",
    title: "Спланируйте посещение",
    when: "Когда",
    where: "Где",
    booking: "Бронирование",
    access: "Доступ",
    lastConfirmed: "Последнее подтверждение",
    officialSource: "Официальный источник",
    reservation: {
      not_required: "Бронирование не требуется",
      recommended: "Бронирование рекомендуется",
      required: "Бронирование обязательно",
    },
    publicAccess: {
      confirmed: "Открытый доступ подтверждён",
      restricted: "Доступ ограничен",
    },
  },
  fr: {
    eyebrow: "En bref",
    title: "Planifier cette activité",
    when: "Quand",
    where: "Où",
    booking: "Réservation",
    access: "Accès",
    lastConfirmed: "Dernière confirmation",
    officialSource: "Source officielle",
    reservation: {
      not_required: "Réservation non requise",
      recommended: "Réservation recommandée",
      required: "Réservation obligatoire",
    },
    publicAccess: {
      confirmed: "Accès public confirmé",
      restricted: "Accès limité",
    },
  },
  ja: {
    eyebrow: "ひと目でわかる情報",
    title: "このアクティビティを計画",
    when: "日時",
    where: "場所",
    booking: "予約",
    access: "入場",
    lastConfirmed: "最終確認",
    officialSource: "公式情報源",
    reservation: {
      not_required: "予約不要",
      recommended: "予約推奨",
      required: "要予約",
    },
    publicAccess: {
      confirmed: "一般入場を確認済み",
      restricted: "入場制限あり",
    },
  },
  ms: {
    eyebrow: "Ringkasan pantas",
    title: "Rancang aktiviti ini",
    when: "Bila",
    where: "Di mana",
    booking: "Tempahan",
    access: "Akses",
    lastConfirmed: "Pengesahan terakhir",
    officialSource: "Sumber rasmi",
    reservation: {
      not_required: "Tempahan tidak diperlukan",
      recommended: "Tempahan disyorkan",
      required: "Tempahan diperlukan",
    },
    publicAccess: {
      confirmed: "Akses awam disahkan",
      restricted: "Akses terhad",
    },
  },
  th: {
    eyebrow: "ข้อมูลสรุป",
    title: "วางแผนกิจกรรมนี้",
    when: "เมื่อไร",
    where: "ที่ไหน",
    booking: "การจอง",
    access: "การเข้าร่วม",
    lastConfirmed: "ยืนยันล่าสุด",
    officialSource: "แหล่งข้อมูลทางการ",
    reservation: {
      not_required: "ไม่ต้องจอง",
      recommended: "แนะนำให้จอง",
      required: "ต้องจอง",
    },
    publicAccess: {
      confirmed: "ยืนยันว่าเปิดให้บุคคลทั่วไป",
      restricted: "จำกัดการเข้าร่วม",
    },
  },
  de: {
    eyebrow: "Kurzinfo",
    title: "Aktivität planen",
    when: "Wann",
    where: "Wo",
    booking: "Reservierung",
    access: "Zugang",
    lastConfirmed: "Zuletzt bestätigt",
    officialSource: "Offizielle Quelle",
    reservation: {
      not_required: "Keine Reservierung erforderlich",
      recommended: "Reservierung empfohlen",
      required: "Reservierung erforderlich",
    },
    publicAccess: {
      confirmed: "Öffentlicher Zugang bestätigt",
      restricted: "Eingeschränkter Zugang",
    },
  },
  es: {
    eyebrow: "Resumen",
    title: "Planifica esta actividad",
    when: "Cuándo",
    where: "Dónde",
    booking: "Reserva",
    access: "Acceso",
    lastConfirmed: "Última confirmación",
    officialSource: "Fuente oficial",
    reservation: {
      not_required: "No se requiere reserva",
      recommended: "Se recomienda reservar",
      required: "Reserva obligatoria",
    },
    publicAccess: {
      confirmed: "Acceso público confirmado",
      restricted: "Acceso restringido",
    },
  },
  id: {
    eyebrow: "Ringkasan cepat",
    title: "Rencanakan aktivitas ini",
    when: "Kapan",
    where: "Di mana",
    booking: "Reservasi",
    access: "Akses",
    lastConfirmed: "Terakhir dikonfirmasi",
    officialSource: "Sumber resmi",
    reservation: {
      not_required: "Reservasi tidak diperlukan",
      recommended: "Reservasi disarankan",
      required: "Reservasi diperlukan",
    },
    publicAccess: {
      confirmed: "Akses publik dikonfirmasi",
      restricted: "Akses terbatas",
    },
  },
};

const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-GB",
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

export const ACTIVITY_GRAPH_QUICK_FACT_LOCALES = Object.keys(COPY) as Locale[];

export function getActivityGraphQuickFactsCopy(locale: Locale): QuickFactsCopy {
  return COPY[locale] ?? COPY.en;
}

function safeDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeTimeZone(timeZone: string | null): string {
  if (!timeZone) return "Asia/Ho_Chi_Minh";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return timeZone;
  } catch {
    return "Asia/Ho_Chi_Minh";
  }
}

function formatWhen(
  startsAt: string,
  endsAt: string | null,
  locale: Locale,
  timeZone: string | null,
): string | null {
  const start = safeDate(startsAt);
  if (!start) return null;

  const intlLocale = LOCALE_TAGS[locale];
  const zone = safeTimeZone(timeZone);
  const startText = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: zone,
  }).format(start);
  const end = safeDate(endsAt);
  if (!end) return startText;

  const localDay = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zone,
  });
  const endText =
    localDay.format(start) === localDay.format(end)
      ? new Intl.DateTimeFormat(intlLocale, {
          timeStyle: "short",
          timeZone: zone,
        }).format(end)
      : new Intl.DateTimeFormat(intlLocale, {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: zone,
        }).format(end);

  return `${startText} – ${endText}`;
}

function formatConfirmedAt(
  value: string | null,
  locale: Locale,
  timeZone: string | null,
): string | null {
  const date = safeDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: safeTimeZone(timeZone),
  }).format(date);
}

function officialSourceUrl(
  sourceMetadata: Record<string, unknown> | null,
): string | null {
  const sourceUrl = sourceMetadata?.source_url;
  if (typeof sourceUrl !== "string") return null;

  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

interface ActivityGraphQuickFactsProps {
  locale: Locale;
  startsAt: string;
  endsAt: string | null;
  timeZone: string | null;
  locationName: string | null;
  address: string | null;
  reservationRequirement: ReservationRequirement;
  publicAccess: PublicAccess;
  lastConfirmedAt: string | null;
  sourceMetadata: Record<string, unknown> | null;
}

export function ActivityGraphQuickFacts({
  locale,
  startsAt,
  endsAt,
  timeZone,
  locationName,
  address,
  reservationRequirement,
  publicAccess,
  lastConfirmedAt,
  sourceMetadata,
}: ActivityGraphQuickFactsProps) {
  const copy = getActivityGraphQuickFactsCopy(locale);
  const when = formatWhen(startsAt, endsAt, locale, timeZone);
  const locationParts = [locationName, address].filter(
    (part, index, parts): part is string =>
      typeof part === "string" &&
      part.trim().length > 0 &&
      parts.findIndex((candidate) => candidate?.trim() === part.trim()) ===
        index,
  );
  const where = locationParts.join(" · ") || null;
  const confirmedAt = formatConfirmedAt(lastConfirmedAt, locale, timeZone);
  const sourceUrl = officialSourceUrl(sourceMetadata);
  const booking =
    reservationRequirement && reservationRequirement !== "unknown"
      ? copy.reservation[reservationRequirement]
      : null;
  const access =
    publicAccess && publicAccess !== "unknown"
      ? copy.publicAccess[publicAccess]
      : null;

  return (
    <section
      aria-labelledby="activity-graph-quick-facts-title"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="border-b bg-muted/30 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {copy.eyebrow}
        </p>
        <h2
          id="activity-graph-quick-facts-title"
          className="mt-1 text-xl font-semibold"
        >
          {copy.title}
        </h2>
      </div>

      <dl className="grid gap-0 sm:grid-cols-2">
        {when && (
          <div className="flex gap-3 border-b px-5 py-4 sm:border-r">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {copy.when}
              </dt>
              <dd className="mt-1 text-sm font-medium leading-relaxed">
                {when}
              </dd>
            </div>
          </div>
        )}

        {where && (
          <div className="flex gap-3 border-b px-5 py-4">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {copy.where}
              </dt>
              <dd className="mt-1 text-sm font-medium leading-relaxed">
                {where}
              </dd>
            </div>
          </div>
        )}

        {booking && (
          <div className="flex gap-3 border-b px-5 py-4 sm:border-b-0 sm:border-r">
            <TicketCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {copy.booking}
              </dt>
              <dd className="mt-1 text-sm font-medium">{booking}</dd>
            </div>
          </div>
        )}

        {access && (
          <div className="flex gap-3 px-5 py-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {copy.access}
              </dt>
              <dd className="mt-1 text-sm font-medium">{access}</dd>
            </div>
          </div>
        )}
      </dl>

      {(confirmedAt || sourceUrl) && (
        <div className="flex flex-col gap-3 border-t bg-muted/20 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          {confirmedAt && (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {copy.lastConfirmed}:{" "}
                <time dateTime={lastConfirmedAt ?? undefined}>
                  {confirmedAt}
                </time>
              </span>
            </span>
          )}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              {copy.officialSource}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      )}
    </section>
  );
}
