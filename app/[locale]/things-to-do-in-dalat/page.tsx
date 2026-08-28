import type { Metadata } from "next";
import {
  ArrowRight,
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
import { getCachedEventsByLifecycle } from "@/lib/cache/server-cache";
import { takeDistinctEventChoices } from "@/lib/events/distinct-choices";
import { formatInDaLatAsync } from "@/lib/timezone";
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
    getCachedEventsByLifecycle("happening", 6),
    getCachedEventsByLifecycle("upcoming", 12),
  ]);

  return takeDistinctEventChoices([...happening, ...upcoming], 6);
}

export default async function ThingsToDoInDalatPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const copy = getThingsToDoCopy(locale);
  const events = await getLiveChoices();
  const eventDates = await Promise.all(
    events.map((event) =>
      formatInDaLatAsync(event.starts_at, "EEE, MMM d · HH:mm", locale),
    ),
  );
  const schemas = buildThingsToDoSchemas(locale);

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
    <main className="min-h-screen pb-24">
      <JsonLd data={schemas} />

      <header className="border-b border-border/60 bg-gradient-to-b from-emerald-500/10 via-background to-background">
        <div className="container mx-auto max-w-5xl px-4 pb-10 pt-8 sm:pb-14 sm:pt-12">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
            <TreePine className="h-4 w-4" aria-hidden="true" />
            {copy.eyebrow}
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {copy.answer}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            {copy.updatedLabel}
          </p>
        </div>
      </header>

      <div className="container mx-auto max-w-5xl space-y-14 px-4 py-10 sm:py-14">
        <section aria-labelledby="live-in-dalat">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2
                id="live-in-dalat"
                className="text-2xl font-bold tracking-tight"
              >
                {copy.liveHeading}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {copy.liveDescription}
              </p>
            </div>
            <Link
              href="/events/upcoming"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              {copy.browseEvents}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {events.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event, index) => (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="group rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {eventDates[index]}
                  </p>
                  <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-snug group-hover:underline">
                    {event.title}
                  </h3>
                  <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="line-clamp-2">
                      {event.location_name || "Đà Lạt"}
                    </span>
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm leading-6 text-muted-foreground">
              {copy.emptyLive}
            </div>
          )}
        </section>

        <section aria-labelledby="dalat-guide">
          <h2 id="dalat-guide" className="text-2xl font-bold tracking-tight">
            {copy.guideHeading}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {copy.guideDescription}
          </p>

          <ol className="mt-6 grid gap-4 sm:grid-cols-2">
            {copy.items.map((item, index) => {
              const Icon = ICONS[item.href as keyof typeof ICONS] || Music2;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex h-full gap-4 rounded-2xl border border-border/70 bg-card p-5 transition hover:border-foreground/20 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {index + 1}. {item.bestFor}
                      </span>
                      <span className="mt-1 block text-lg font-semibold group-hover:underline">
                        {item.title}
                      </span>
                      <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="rounded-3xl bg-emerald-950 px-6 py-7 text-emerald-50 sm:px-8 sm:py-8">
          <h2 className="text-xl font-bold">{copy.practicalHeading}</h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {copy.practicalPoints.map((point) => (
              <li
                key={point}
                className="flex gap-3 text-sm leading-6 text-emerald-50/85"
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="dalat-faq">
          <h2 id="dalat-faq" className="text-2xl font-bold tracking-tight">
            {copy.faqHeading}
          </h2>
          <div className="mt-5 divide-y divide-border rounded-2xl border border-border/70 bg-card px-5 sm:px-6">
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
