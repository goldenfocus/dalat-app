import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ExternalLink,
  Flower2,
  MapPinned,
  Music2,
  Sprout,
  UsersRound,
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
  FLOWER_FESTIVAL_2026_PATH,
  FLOWER_FESTIVAL_IMAGE,
  FLOWER_FESTIVAL_LAST_CHECKED,
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
    path: FLOWER_FESTIVAL_PATH,
    title: t("overview.seoTitle"),
    description: t("overview.seoDescription"),
    image: FLOWER_FESTIVAL_IMAGE,
    keywords: [
      "Da Lat Flower Festival",
      "Festival Hoa Da Lat",
      "Dalat flower festival guide",
      "Lam Dong flower festival",
    ],
  });
}

export default async function DaLatFlowerFestivalPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("flowerFestivalGuide");

  const faqs = [
    { question: t("overview.faq.whatQuestion"), answer: t("overview.faq.whatAnswer") },
    { question: t("overview.faq.annualQuestion"), answer: t("overview.faq.annualAnswer") },
    { question: t("overview.faq.whereQuestion"), answer: t("overview.faq.whereAnswer") },
    { question: t("overview.faq.ticketsQuestion"), answer: t("overview.faq.ticketsAnswer") },
  ];

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: t("common.home"), url: "/" },
      { name: t("common.festivals"), url: "/festivals" },
      { name: t("common.name"), url: FLOWER_FESTIVAL_PATH },
    ],
    locale
  );

  const seriesSchema = {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    "@id": `${localeUrl(locale, FLOWER_FESTIVAL_PATH)}#festival`,
    name: t("common.name"),
    alternateName: t("common.nativeName"),
    description: t("overview.seoDescription"),
    url: localeUrl(locale, FLOWER_FESTIVAL_PATH),
    image: [FLOWER_FESTIVAL_IMAGE],
    inLanguage: locale,
    location: {
      "@type": "AdministrativeArea",
      name: "Da Lat, Lâm Đồng, Vietnam",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Da Lat",
        addressRegion: "Lâm Đồng",
        addressCountry: "VN",
      },
    },
    organizer: {
      "@type": "GovernmentOrganization",
      name: "Lâm Đồng Provincial People's Committee",
      url: "https://lamdong.gov.vn",
    },
    sameAs: Object.values(FLOWER_FESTIVAL_SOURCES),
    dateModified: FLOWER_FESTIVAL_LAST_CHECKED,
  };

  return (
    <>
      <JsonLd
        data={[seriesSchema, breadcrumbSchema, generateFAQSchema(faqs)]}
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
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-black/25" />
            </div>

            <div className="relative mx-auto flex min-h-[460px] max-w-5xl flex-col justify-between px-4 py-6 sm:min-h-[540px] sm:px-6 sm:py-8">
              <div className="flex items-start justify-between gap-4">
                <Link
                  href="/festivals"
                  className="-ml-3 inline-flex min-h-11 w-fit shrink-0 items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm text-white backdrop-blur-sm transition-all hover:bg-black/40 active:scale-95"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t("common.backToFestivals")}
                </Link>
                <p className="max-w-xs rounded-lg bg-black/45 px-3 py-2 text-right text-xs leading-relaxed text-white/90 backdrop-blur-sm">
                  {t("common.imageCaption")}
                </p>
              </div>

              <div className="max-w-3xl pb-4">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-background/85 px-3 py-1.5 text-sm font-medium text-primary backdrop-blur-sm">
                  <Flower2 className="h-4 w-4" aria-hidden="true" />
                  {t("overview.badge")}
                </div>
                <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
                  {t("common.name")}
                </h1>
                <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-foreground/85 sm:text-xl">
                  {t("overview.lead")}
                </p>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-5xl space-y-16 px-4 py-12 sm:px-6 sm:py-16">
            <section aria-labelledby="festival-introduction">
              <div className="max-w-3xl">
                <h2 id="festival-introduction" className="text-2xl font-bold sm:text-3xl">
                  {t("overview.introTitle")}
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                  {t("overview.introBody")}
                </p>
              </div>

              <dl className="mt-8 grid gap-4 sm:grid-cols-3">
                {(["first", "rhythm", "reach"] as const).map((fact) => (
                  <div key={fact} className="rounded-2xl border bg-card p-5">
                    <dt className="text-sm font-medium text-muted-foreground">
                      {t(`overview.facts.${fact}Label`)}
                    </dt>
                    <dd className="mt-2 text-lg font-semibold">
                      {t(`overview.facts.${fact}Value`)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-9">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                {t("overview.latestEyebrow")}
              </p>
              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                {t("overview.latestTitle")}
              </h2>
              <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
                {t("overview.latestBody")}
              </p>
              <Link
                href={FLOWER_FESTIVAL_2026_PATH}
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-3 font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
              >
                {t("overview.explore2026")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </section>

            <section aria-labelledby="festival-meaning">
              <h2 id="festival-meaning" className="text-2xl font-bold sm:text-3xl">
                {t("overview.whyTitle")}
              </h2>
              <div className="mt-7 grid gap-5 md:grid-cols-3">
                {[
                  { key: "growers", icon: Sprout },
                  { key: "culture", icon: Music2 },
                  { key: "city", icon: UsersRound },
                ].map(({ key, icon: Icon }) => (
                  <div key={key} className="rounded-2xl border bg-card p-6">
                    <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                    <h3 className="mt-4 text-lg font-semibold">
                      {t(`overview.why.${key}Title`)}
                    </h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">
                      {t(`overview.why.${key}Body`)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="festival-expect">
              <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                <div>
                  <h2 id="festival-expect" className="text-2xl font-bold sm:text-3xl">
                    {t("overview.expectTitle")}
                  </h2>
                  <p className="mt-4 leading-relaxed text-muted-foreground">
                    {t("overview.planBody")}
                  </p>
                </div>
                <ul className="grid gap-3">
                  {(["flowers", "music", "local", "beyond"] as const).map(
                    (item) => (
                      <li
                        key={item}
                        className="flex gap-3 rounded-xl border bg-card px-4 py-4"
                      >
                        <Flower2
                          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>{t(`overview.expect.${item}`)}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            </section>

            <section aria-labelledby="festival-faq">
              <h2 id="festival-faq" className="text-2xl font-bold sm:text-3xl">
                {t("overview.faqTitle")}
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

            <section
              aria-labelledby="festival-sources"
              className="rounded-2xl border bg-muted/35 p-6"
            >
              <div className="flex items-start gap-3">
                <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h2 id="festival-sources" className="font-semibold">
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
                  <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    <time dateTime={FLOWER_FESTIVAL_LAST_CHECKED}>
                      {t("common.lastChecked")}
                    </time>
                  </p>
                </div>
              </div>
            </section>
          </div>
        </article>
      </main>
    </>
  );
}
