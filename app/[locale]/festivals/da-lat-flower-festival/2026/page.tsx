import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleHelp,
  Clock3,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { buildLocales, type Locale } from "@/lib/i18n/routing";
import { generateLocalizedMetadata, localeUrl } from "@/lib/metadata";
import {
  JsonLd,
  generateBreadcrumbSchema,
  generateFAQSchema,
} from "@/lib/structured-data";
import {
  FLOWER_FESTIVAL_2026_DATES,
  FLOWER_FESTIVAL_2026_PATH,
  FLOWER_FESTIVAL_EVENT_PATH,
  FLOWER_FESTIVAL_IMAGE,
  FLOWER_FESTIVAL_LAST_CHECKED,
  FLOWER_FESTIVAL_PAST_PHOTOS,
  FLOWER_FESTIVAL_PATH,
  FLOWER_FESTIVAL_SOURCES,
} from "@/lib/festivals/da-lat-flower-festival";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return buildLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "flowerFestivalGuide",
  });

  return generateLocalizedMetadata({
    locale,
    path: FLOWER_FESTIVAL_2026_PATH,
    title: t("edition2026.seoTitle"),
    description: t("edition2026.seoDescription"),
    image: FLOWER_FESTIVAL_IMAGE,
    keywords: [
      "Da Lat Flower Festival 2026",
      "Festival Hoa Da Lat 2026",
      "Da Lat Flower Festival dates",
      "Da Lat Flower Festival program",
    ],
  });
}

export default async function DaLatFlowerFestival2026Page({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("flowerFestivalGuide");

  const faqs = [
    {
      question: t("edition2026.faq.datesQuestion"),
      answer: t("edition2026.faq.datesAnswer"),
    },
    {
      question: t("edition2026.faq.freeQuestion"),
      answer: t("edition2026.faq.freeAnswer"),
    },
    {
      question: t("edition2026.faq.whereQuestion"),
      answer: t("edition2026.faq.whereAnswer"),
    },
  ];

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: t("common.home"), url: "/" },
      { name: t("common.festivals"), url: "/festivals" },
      { name: t("common.name"), url: FLOWER_FESTIVAL_PATH },
      { name: t("edition2026.shortTitle"), url: FLOWER_FESTIVAL_2026_PATH },
    ],
    locale
  );

  const square = {
    "@type": "Place",
    name: "Lâm Viên Square",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Lâm Viên Square",
      addressLocality: "Da Lat",
      addressRegion: "Lâm Đồng",
      addressCountry: "VN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 11.9404,
      longitude: 108.4583,
    },
  };

  const festivalSchema = {
    "@context": "https://schema.org",
    "@type": "Festival",
    "@id": `${localeUrl(locale, FLOWER_FESTIVAL_2026_PATH)}#festival`,
    name: t("edition2026.title"),
    alternateName: "Festival Hoa Đà Lạt lần thứ XI - năm 2026",
    description: t("edition2026.seoDescription"),
    url: localeUrl(locale, FLOWER_FESTIVAL_2026_PATH),
    image: [FLOWER_FESTIVAL_IMAGE],
    startDate: `${FLOWER_FESTIVAL_2026_DATES.opening}T20:00:00+07:00`,
    endDate: `${FLOWER_FESTIVAL_2026_DATES.closing}T20:00:00+07:00`,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    inLanguage: locale,
    location: square,
    organizer: {
      "@type": "GovernmentOrganization",
      name: "Lâm Đồng Provincial People's Committee",
      url: "https://lamdong.gov.vn",
    },
    subEvent: [
      {
        "@type": "Event",
        name: t("edition2026.schema.openingName"),
        startDate: "2026-12-19T20:00:00+07:00",
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: square,
      },
      {
        "@type": "ExhibitionEvent",
        name: t("edition2026.schema.flowerSpacesName"),
        startDate: "2026-12-18",
        endDate: "2027-01-03",
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: "Xuan Huong Lake and central Da Lat",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Da Lat",
            addressRegion: "Lâm Đồng",
            addressCountry: "VN",
          },
        },
      },
      {
        "@type": "MusicEvent",
        name: t("edition2026.schema.jazzName"),
        startDate: "2026-12-25",
        endDate: "2026-12-27",
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: "Xuan Huong Lake",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Da Lat",
            addressRegion: "Lâm Đồng",
            addressCountry: "VN",
          },
        },
      },
      {
        "@type": "Event",
        name: t("edition2026.schema.closingName"),
        startDate: "2026-12-31T20:00:00+07:00",
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: square,
      },
    ],
    sameAs: Object.values(FLOWER_FESTIVAL_SOURCES),
    dateModified: FLOWER_FESTIVAL_LAST_CHECKED,
  };

  const programs = [
    { key: "flower", timed: true },
    { key: "exhibitions", timed: false },
    { key: "science", timed: false },
    { key: "flavors", timed: false },
    { key: "brocade", timed: false },
    { key: "jazz", timed: true },
    { key: "carnival", timed: true },
  ] as const;

  return (
    <>
      <JsonLd
        data={[festivalSchema, breadcrumbSchema, generateFAQSchema(faqs)]}
      />
      <main className="min-h-screen bg-background">
        <article>
          <header className="relative isolate overflow-hidden border-b">
            <div className="absolute inset-0">
              <Image
                src={FLOWER_FESTIVAL_IMAGE}
                alt={t("common.imageAlt")}
                fill
                priority
                sizes="100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-black/25" />
            </div>

            <div className="relative mx-auto flex min-h-[500px] max-w-5xl flex-col justify-between px-4 py-6 sm:min-h-[570px] sm:px-6 sm:py-8">
              <div className="flex items-start justify-between gap-4">
                <Link
                  href={FLOWER_FESTIVAL_PATH}
                  className="-ml-3 inline-flex min-h-11 w-fit shrink-0 items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm text-white backdrop-blur-sm transition-all hover:bg-black/40 active:scale-95"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t("edition2026.backToGuide")}
                </Link>
                <p className="max-w-xs rounded-lg bg-black/45 px-3 py-2 text-right text-xs leading-relaxed text-white/90 backdrop-blur-sm">
                  {t("common.imageCaption")}
                </p>
              </div>

              <div className="max-w-3xl pb-4">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-background/85 px-3 py-1.5 text-sm font-medium text-primary backdrop-blur-sm">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  {t("edition2026.badge")}
                </div>
                <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
                  {t("edition2026.title")}
                </h1>
                <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-foreground/85 sm:text-xl">
                  {t("edition2026.lead")}
                </p>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-5xl space-y-16 px-4 py-12 sm:px-6 sm:py-16">
            <section
              aria-labelledby="official-status"
              className="rounded-2xl border border-primary/25 bg-primary/5 p-6 sm:p-8"
            >
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h2 id="official-status" className="text-xl font-bold">
                    {t("edition2026.statusTitle")}
                  </h2>
                  <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
                    {t("edition2026.statusBody")}
                  </p>
                  <p className="mt-4 text-sm font-medium text-primary">
                    {t("common.lastChecked")}
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="past-editions-gallery">
              <div className="max-w-3xl">
                <h2
                  id="past-editions-gallery"
                  className="text-2xl font-bold sm:text-3xl"
                >
                  {t("edition2026.pastGallery.title")}
                </h2>
                <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
                  {t("edition2026.pastGallery.intro")}
                </p>
              </div>

              <div className="mt-7 grid gap-5 md:grid-cols-3">
                {FLOWER_FESTIVAL_PAST_PHOTOS.map((photo) => {
                  const caption = t(
                    `edition2026.pastGallery.${photo.captionKey}`
                  );

                  return (
                    <figure
                      key={photo.src}
                      className="group overflow-hidden rounded-2xl border bg-card shadow-sm"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                        <Image
                          src={photo.src}
                          alt={caption}
                          fill
                          sizes="(min-width: 768px) 30vw, 100vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                          {t("edition2026.pastGallery.archiveLabel", {
                            year: photo.year,
                          })}
                        </span>
                      </div>
                      <figcaption className="p-4">
                        <p className="text-sm font-medium leading-relaxed">
                          {caption}
                        </p>
                        <a
                          href={photo.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer license"
                          className="mt-3 inline-flex min-h-11 items-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-primary hover:underline"
                          aria-label={`${t("edition2026.pastGallery.viewOriginal")}: ${caption}`}
                        >
                          {t("edition2026.pastGallery.credit", {
                            photographer: photo.photographer,
                            license: photo.license,
                          })}
                          <ExternalLink
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        </a>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="key-details">
              <h2 id="key-details" className="text-2xl font-bold sm:text-3xl">
                {t("edition2026.detailsTitle")}
              </h2>
              <dl className="mt-7 grid gap-4 sm:grid-cols-2">
                {(["theme", "opening", "closing", "scope"] as const).map(
                  (detail) => (
                    <div key={detail} className="rounded-2xl border bg-card p-5 sm:p-6">
                      <dt className="text-sm font-semibold uppercase tracking-wide text-primary">
                        {t(`edition2026.details.${detail}Label`)}
                      </dt>
                      <dd className="mt-2 text-lg font-semibold">
                        {detail === "opening" ? (
                          <time dateTime="2026-12-19T20:00:00+07:00">
                            {t(`edition2026.details.${detail}Value`)}
                          </time>
                        ) : detail === "closing" ? (
                          <time dateTime="2026-12-31T20:00:00+07:00">
                            {t(`edition2026.details.${detail}Value`)}
                          </time>
                        ) : (
                          t(`edition2026.details.${detail}Value`)
                        )}
                      </dd>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {t(`edition2026.details.${detail}Note`)}
                      </p>
                    </div>
                  )
                )}
              </dl>
            </section>

            <section aria-labelledby="published-program">
              <div className="max-w-3xl">
                <h2 id="published-program" className="text-2xl font-bold sm:text-3xl">
                  {t("edition2026.programTitle")}
                </h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {t("edition2026.programIntro")}
                </p>
              </div>
              <ul className="mt-7 grid gap-4 sm:grid-cols-2">
                {programs.map(({ key, timed }) => (
                  <li key={key} className="rounded-2xl border bg-card p-5">
                    <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {timed ? (
                        <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      ) : (
                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {timed
                        ? t("edition2026.publishedTiming")
                        : t("edition2026.detailsPending")}
                    </div>
                    <p className="font-medium leading-relaxed">
                      {t(`edition2026.programs.${key}`)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section
              aria-labelledby="awaiting-confirmation"
              className="rounded-3xl border bg-muted/35 p-6 sm:p-8"
            >
              <div className="flex items-start gap-3">
                <CircleHelp className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                <div className="w-full">
                  <h2 id="awaiting-confirmation" className="text-2xl font-bold">
                    {t("edition2026.pendingTitle")}
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    {t("edition2026.pendingIntro")}
                  </p>
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                    {(["schedule", "venues", "tickets", "access"] as const).map(
                      (item) => (
                        <li key={item} className="flex gap-3 rounded-xl bg-background p-4">
                          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span>{t(`edition2026.pending.${item}`)}</span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              </div>
            </section>

            <section aria-labelledby="visit-planning">
              <h2 id="visit-planning" className="text-2xl font-bold sm:text-3xl">
                {t("edition2026.planTitle")}
              </h2>
              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                {(["stay", "book", "weather", "check"] as const).map((tip) => (
                  <div key={tip} className="rounded-2xl border bg-card p-5">
                    <h3 className="font-semibold">{t(`edition2026.plan.${tip}Title`)}</h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">
                      {t(`edition2026.plan.${tip}Body`)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
                <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold">{t("edition2026.accessTitle")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("edition2026.accessBody")}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
              <h2 className="text-xl font-bold">{t("edition2026.listingTitle")}</h2>
              <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
                {t("edition2026.listingBody")}
              </p>
              <Link
                href={FLOWER_FESTIVAL_EVENT_PATH}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
              >
                {t("common.eventListing")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>

            <section aria-labelledby="edition-faq">
              <h2 id="edition-faq" className="text-2xl font-bold sm:text-3xl">
                {t("edition2026.faqTitle")}
              </h2>
              <div className="mt-6 grid gap-4">
                {faqs.map((faq) => (
                  <div key={faq.question} className="rounded-2xl border bg-card p-5 sm:p-6">
                    <h3 className="font-semibold">{faq.question}</h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="edition-sources" className="rounded-2xl border p-6">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h2 id="edition-sources" className="font-semibold">
                    {t("common.officialSources")}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("common.sourcesNote")}
                  </p>
                  <ul className="mt-4 space-y-3 text-sm">
                    {(
                      [
                        ["sourceMinistry", FLOWER_FESTIVAL_SOURCES.ministryOfCulture],
                        ["sourceTourism", FLOWER_FESTIVAL_SOURCES.tourismPromotion],
                        ["sourceProvince", FLOWER_FESTIVAL_SOURCES.provincialUpdate],
                        ["sourceNational", FLOWER_FESTIVAL_SOURCES.nationalTourism],
                      ] as const
                    ).map(([label, url]) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-2 py-2 text-primary hover:underline"
                        >
                          {t(`common.${label}`)}
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </article>
      </main>
    </>
  );
}

export const revalidate = 86_400;
