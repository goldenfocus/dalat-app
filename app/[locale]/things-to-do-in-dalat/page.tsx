import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Coffee,
  MapPin,
  Mountain,
  Music2,
  Palette,
  Sparkles,
  TreePine,
  UtensilsCrossed,
  Wine,
} from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { Link, buildLocales, type Locale } from "@/lib/i18n/routing";
import { generateLocalizedMetadata, localeUrl } from "@/lib/metadata";
import { JsonLd } from "@/lib/structured-data";
import {
  getCachedEventsByLifecycle,
  getCachedHomepageConfig,
} from "@/lib/cache/server-cache";
import { takeDistinctEventChoices } from "@/lib/events/distinct-choices";
import { formatInDaLatAsync } from "@/lib/timezone";
import { optimizedImageUrl } from "@/lib/image-cdn";
import { isVideoUrl } from "@/lib/media-utils";
import {
  buildThingsToDoSchemas,
  getThingsToDoCopy,
  THINGS_TO_DO_PATH,
} from "@/lib/seo/things-to-do";

export const revalidate = 300;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

const ICONS = {
  "/tonight": Clock3,
  "/this-weekend": CalendarDays,
  "/cafes": Coffee,
  "/hiking": Mountain,
  "/restaurants": UtensilsCrossed,
  "/bars": Wine,
  "/galleries": Palette,
  "/festivals": Sparkles,
} as const;

const DEFAULT_DALAT_HERO =
  "https://cdn.dalat.app/promo-media/homepage-hero/dalat-app-home-img-2.png";

const MOOD_IMAGES = [
  "/images/things-to-do/dalat-coffee.jpg",
  "/images/things-to-do/dalat-pine-trails.jpg",
  "/images/things-to-do/dalat-food.jpg",
  "/images/things-to-do/dalat-after-dark.jpg",
] as const;

function absoluteImageUrl(url: string | null): string | null {
  return url?.startsWith("/") ? `https://dalat.app${url}` : url;
}

export function generateStaticParams() {
  return buildLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const copy = getThingsToDoCopy(locale);

  return generateLocalizedMetadata({
    locale,
    path: THINGS_TO_DO_PATH,
    title: copy.metaTitle,
    description: copy.metaDescription,
    noTitleSuffix: true,
    keywords: [
      "things to do in Dalat",
      "things to do in Da Lat",
      "what to do in Dalat",
      "Dalat activities",
      "Dalat travel guide",
      "Dalat events",
      "Đà Lạt có gì chơi",
      "chơi gì ở Đà Lạt",
    ],
  });
}

async function getLiveChoices() {
  const [happening, upcoming] = await Promise.all([
    getCachedEventsByLifecycle("happening", 3),
    getCachedEventsByLifecycle("upcoming", 8),
  ]);

  return takeDistinctEventChoices([...happening, ...upcoming], 3);
}

export default async function ThingsToDoInDalatPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const copy = getThingsToDoCopy(locale);
  const [events, homepageConfig] = await Promise.all([
    getLiveChoices(),
    getCachedHomepageConfig(),
  ]);
  const eventDates = await Promise.all(
    events.map((event) =>
      formatInDaLatAsync(event.starts_at, "EEE, MMM d · HH:mm", locale),
    ),
  );
  const schemas = buildThingsToDoSchemas(locale);
  const labels =
    locale === "vi"
      ? {
          eyebrow: "Cẩm nang địa phương · đang cập nhật",
          tagline: "Đồi thông, cà phê chậm và những đêm rất Đà Lạt.",
          tonight: "Xem tối nay",
          map: "Mở bản đồ",
          moodHeading: "Hôm nay bạn muốn gì?",
          moodDescription: "Chọn một cảm giác. Đà Lạt sẽ lo phần còn lại.",
          liveHeading: "Đang có gì vui",
          liveDescription: "Ba gợi ý thật từ lịch địa phương.",
          moreHeading: "Thêm cách để dạo chơi",
          planHeading: "Một ngày thật nhẹ",
          moodTitles: ["Cà phê", "Đồi thông", "Món ngon", "Đà Lạt về đêm"],
          moreTitles: ["Tối nay", "Cuối tuần", "Nghệ thuật", "Lễ hội"],
          empty: "Chưa có lịch mới lúc này — xem toàn bộ sự kiện.",
        }
      : {
          eyebrow: "Local guide · live",
          tagline: "Pine trails, slow coffee and distinctly Dalat nights.",
          tonight: "See tonight",
          map: "Open the map",
          moodHeading: "What are you in the mood for?",
          moodDescription: "Pick a feeling. Let Dalat do the rest.",
          liveHeading: "Something good is happening",
          liveDescription: "Three real picks from the local calendar.",
          moreHeading: "More ways to wander",
          planHeading: "An easy Dalat rhythm",
          moodTitles: ["Coffee", "Pine trails", "Good food", "After dark"],
          moreTitles: ["Tonight", "This weekend", "Art", "Festivals"],
          empty: "Nothing new right now — see the full calendar.",
        };
  const primaryItems = copy.items.slice(2, 6);
  const moreItems = [copy.items[0], copy.items[1], ...copy.items.slice(6)];
  const firstEventImage = events.find(
    (event) => event.image_url && !isVideoUrl(event.image_url),
  )?.image_url;
  const heroImage = absoluteImageUrl(
    optimizedImageUrl(
      homepageConfig?.hero_image_url || firstEventImage || DEFAULT_DALAT_HERO,
      {
      width: 1920,
      height: 1080,
      quality: 85,
      fit: "cover",
      },
    ),
  );

  if (events.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name:
        locale === "vi"
          ? "Sự kiện sắp tới ở Đà Lạt"
          : "Upcoming events in Dalat",
      numberOfItems: events.length,
      itemListElement: events.map((event, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: localeUrl(locale, `/events/${event.slug}`),
        item: {
          "@type": "Event",
          name: event.title,
          startDate: event.starts_at,
          ...(event.ends_at ? { endDate: event.ends_at } : {}),
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: event.is_online
            ? "https://schema.org/OnlineEventAttendanceMode"
            : "https://schema.org/OfflineEventAttendanceMode",
          ...(!event.is_online
            ? {
                location: {
                  "@type": "Place",
                  name: event.location_name || "Đà Lạt",
                  address: {
                    "@type": "PostalAddress",
                    addressLocality: "Đà Lạt",
                    addressRegion: "Lâm Đồng",
                    addressCountry: "VN",
                  },
                },
              }
            : {
                location: {
                  "@type": "VirtualLocation",
                  url: localeUrl(locale, `/events/${event.slug}`),
                },
              }),
        },
      })),
    });
  }

  return (
    <main className="min-h-screen overflow-hidden pb-20">
      <JsonLd data={schemas} />

      <header className="relative min-h-[500px] overflow-hidden bg-emerald-950 text-white sm:min-h-[600px]">
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: homepageConfig?.hero_focal_point || "center" }}
            fetchPriority="high"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/10" />

        <div className="container relative mx-auto flex min-h-[500px] max-w-6xl items-end px-4 pb-12 pt-20 sm:min-h-[600px] sm:pb-16">
          <div className="max-w-3xl">
            <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
              <TreePine className="h-4 w-4" aria-hidden="true" />
              {labels.eyebrow}
            </p>
            <h1 className="text-5xl font-bold tracking-[-0.04em] text-balance sm:text-7xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-white/80 sm:text-xl">
              {labels.tagline}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/tonight"
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
              >
                {labels.tonight}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/map"
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/35 bg-black/20 px-5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {labels.map}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-6xl space-y-20 px-4 py-14 sm:py-20">
        <section aria-labelledby="dalat-guide">
          <div className="max-w-2xl">
            <h2 id="dalat-guide" className="text-3xl font-bold tracking-tight sm:text-4xl">
              {labels.moodHeading}
            </h2>
            <p className="mt-2 text-muted-foreground">{labels.moodDescription}</p>
          </div>

          <ol className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {primaryItems.map((item, index) => {
              const Icon = ICONS[item.href as keyof typeof ICONS] || Music2;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group relative flex min-h-40 flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-muted p-4 text-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-48 sm:p-6"
                  >
                    <Image
                      src={MOOD_IMAGES[index]}
                      alt=""
                      fill
                      sizes="(max-width: 639px) 50vw, (max-width: 1023px) 50vw, 25vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-black/10" />
                    <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-black/30 shadow-sm backdrop-blur-md">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="relative mt-6 flex items-end justify-between gap-2">
                      <span className="block text-lg font-semibold leading-tight sm:text-xl">
                        {labels.moodTitles[index]}
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-white/70 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex flex-wrap gap-2">
            {moreItems.map((item, index) => {
              const Icon = ICONS[item.href as keyof typeof ICONS] || Music2;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium transition hover:bg-muted"
                >
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {labels.moreTitles[index]}
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="live-in-dalat">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <h2 id="live-in-dalat" className="text-3xl font-bold tracking-tight sm:text-4xl">
                {labels.liveHeading}
              </h2>
              <p className="mt-2 text-muted-foreground">{labels.liveDescription}</p>
            </div>
            <Link
              href="/events/upcoming"
              aria-label={copy.browseEvents}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card transition hover:bg-muted sm:w-auto sm:gap-2 sm:px-4"
            >
              <span className="hidden text-sm font-semibold sm:inline">{copy.browseEvents}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {events.length > 0 ? (
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
              {events.map((event, index) => {
                const eventImage =
                  event.image_url && !isVideoUrl(event.image_url)
                    ? absoluteImageUrl(
                        optimizedImageUrl(event.image_url, {
                          width: 900,
                          height: 700,
                          quality: 80,
                          fit: "cover",
                        }),
                      )
                    : null;
                return (
                  <Link
                    key={event.id}
                    href={`/events/${event.slug}`}
                    className="group relative aspect-[4/5] min-w-[82%] snap-start overflow-hidden rounded-3xl bg-emerald-950 text-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:min-w-0"
                  >
                    {eventImage ? (
                      <img
                        src={eventImage}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-800 via-teal-900 to-slate-950" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                        {eventDates[index]}
                      </p>
                      <h3 className="mt-2 line-clamp-2 text-xl font-semibold leading-tight">
                        {event.title}
                      </h3>
                      <p className="mt-3 flex items-center gap-2 text-sm text-white/75">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="line-clamp-1">{event.location_name || "Đà Lạt"}</span>
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-8 text-sm text-muted-foreground">
              {labels.empty}
            </div>
          )}
        </section>

        <section className="rounded-[2rem] bg-emerald-950 px-6 py-8 text-emerald-50 sm:px-10 sm:py-10">
          <h2 className="text-2xl font-bold">{labels.planHeading}</h2>
          <ul className="mt-6 grid gap-5 md:grid-cols-3">
            {copy.practicalPoints.map((point) => (
              <li
                key={point}
                className="flex gap-3 text-sm leading-6 text-emerald-50/80"
              >
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="dalat-faq" className="mx-auto w-full max-w-3xl">
          <h2 id="dalat-faq" className="text-center text-2xl font-bold tracking-tight">
            {copy.faqHeading}
          </h2>
          <div className="mt-5 divide-y divide-border rounded-3xl border border-border/70 bg-card px-5 sm:px-7">
            {copy.faqs.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 font-semibold marker:content-none">
                  {faq.question}
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
