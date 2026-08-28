import type { Metadata } from "next";
import { Link } from "@/lib/i18n/routing";
import Image from "next/image";
import { ArrowRight, Calendar, MapPin, BadgeCheck, Flower2 } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Festival, FestivalOrganizer } from "@/lib/types";
import type { Locale } from "@/lib/i18n/routing";
import { generateLocalizedMetadata, localeUrl } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import {
  FLOWER_FESTIVAL_2026_DATES,
  FLOWER_FESTIVAL_2026_PATH,
  FLOWER_FESTIVAL_IMAGE,
  FLOWER_FESTIVAL_PATH,
} from "@/lib/festivals/da-lat-flower-festival";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "festival" });
  return generateLocalizedMetadata({
    locale,
    path: "/festivals",
    title: t("listingSeoTitle"),
    description: t("listingSeoDescription"),
    keywords: [
      "Da Lat festivals",
      "Vietnam festivals",
      "Dalat events",
      "Da Lat flower festival",
      "highland festivals",
    ],
  });
}

async function getFestivals() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("festivals")
    .select(
      `
      *,
      festival_organizers (
        *,
        organizers (id, name, logo_url, is_verified)
      )
    `
    )
    .eq("status", "published")
    .order("start_date", { ascending: true });

  return (data ?? []) as (Festival & {
    festival_organizers: (FestivalOrganizer & {
      organizers: { id: string; name: string; logo_url: string | null; is_verified: boolean };
    })[];
  })[];
}

export default async function FestivalsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [festivals, tFestival, tFlowerFestival] = await Promise.all([
    getFestivals(),
    getTranslations("festival"),
    getTranslations("flowerFestivalGuide"),
  ]);

  // Separate active/upcoming and past festivals
  const now = new Date();
  const activeFestivals = festivals.filter(
    (f) => new Date(f.end_date) >= now
  );
  const pastFestivals = festivals.filter(
    (f) => new Date(f.end_date) < now
  );

  // Generate structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: tFlowerFestival("common.home"), url: "/" },
      { name: tFlowerFestival("common.festivals"), url: "/festivals" },
    ],
    locale
  );

  const festivalListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: tFestival("listingSchemaName"),
    description: tFestival("listingSchemaDescription"),
    numberOfItems: festivals.length + 1,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        url: localeUrl(locale, FLOWER_FESTIVAL_2026_PATH),
        name: tFlowerFestival("edition2026.title"),
        item: {
          "@type": "Festival",
          name: tFlowerFestival("edition2026.title"),
          startDate: `${FLOWER_FESTIVAL_2026_DATES.opening}T20:00:00+07:00`,
          endDate: `${FLOWER_FESTIVAL_2026_DATES.closing}T20:00:00+07:00`,
          location: {
            "@type": "Place",
            name: "Lâm Viên Square",
            address: {
              "@type": "PostalAddress",
              streetAddress: "Quảng trường Lâm Viên, đường Trần Quốc Toản",
              addressLocality: "Da Lat",
              addressRegion: "Lâm Đồng",
              addressCountry: "VN",
            },
          },
        },
      },
      ...festivals.slice(0, 49).map((festival, index) => ({
        "@type": "ListItem",
        position: index + 2,
        url: localeUrl(locale, `/festivals/${festival.slug}`),
        name: festival.title,
        item: {
          "@type": "Festival",
          name: festival.title,
          startDate: festival.start_date,
          endDate: festival.end_date,
          location: {
            "@type": "Place",
            name: festival.location_city || "Da Lat",
            address: {
              "@type": "PostalAddress",
              addressLocality: festival.location_city || "Da Lat",
              addressCountry: "VN",
            },
          },
        },
      })),
    ],
  };

  return (
    <>
      <JsonLd data={[breadcrumbSchema, festivalListSchema]} />
      <div className="min-h-screen">
      <main className="container max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">{tFestival("title")}</h1>
        <Link
          href={FLOWER_FESTIVAL_PATH}
          className="group mb-10 grid overflow-hidden rounded-2xl border bg-card transition-all hover:border-primary/50 sm:grid-cols-[0.9fr_1.1fr]"
        >
          <div className="relative min-h-52 sm:min-h-full">
            <Image
              src={FLOWER_FESTIVAL_IMAGE}
              alt={tFlowerFestival("common.imageAlt")}
              fill
              sizes="(min-width: 640px) 400px, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span className="absolute inset-x-2 bottom-2 rounded-md bg-black/55 px-2 py-1.5 text-xs leading-relaxed text-white/90 backdrop-blur-sm">
              {tFlowerFestival("common.imageCaption")}
            </span>
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-8">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Flower2 className="h-4 w-4" aria-hidden="true" />
              {tFlowerFestival("overview.latestEyebrow")}
            </div>
            <h2 className="mt-3 text-2xl font-bold">
              {tFlowerFestival("common.name")}
            </h2>
            <p className="mt-3 line-clamp-3 leading-relaxed text-muted-foreground">
              {tFlowerFestival("overview.latestBody")}
            </p>
            <span className="mt-5 inline-flex min-h-11 items-center gap-2 py-2 font-medium text-primary">
              {tFlowerFestival("overview.exploreGuide")}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </div>
        </Link>
        {/* Active/Upcoming Festivals */}
        {activeFestivals.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{tFestival("activeUpcoming")}</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {activeFestivals.map((festival) => (
                <FestivalCard
                  key={festival.id}
                  festival={festival}
                  locale={locale}
                  happeningNowLabel={tFestival("happeningNow")}
                />
              ))}
            </div>
          </section>
        )}

        {/* Past Festivals */}
        {pastFestivals.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-6 text-muted-foreground">
              {tFestival("pastFestivals")}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {pastFestivals.map((festival) => (
                <FestivalCard
                  key={festival.id}
                  festival={festival}
                  locale={locale}
                  isPast
                  happeningNowLabel={tFestival("happeningNow")}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {festivals.length === 0 && (
          <div className="text-center py-20">
            <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-xl font-semibold mb-2">{tFestival("emptyTitle")}</h3>
            <p className="text-muted-foreground">
              {tFestival("emptyDescription")}
            </p>
          </div>
        )}
      </main>
    </div>
    </>
  );
}

function FestivalCard({
  festival,
  locale,
  isPast,
  happeningNowLabel,
}: {
  festival: Festival & {
    festival_organizers: (FestivalOrganizer & {
      organizers: { id: string; name: string; logo_url: string | null; is_verified: boolean };
    })[];
  };
  locale: Locale;
  isPast?: boolean;
  happeningNowLabel: string;
}) {
  const startDate = new Date(festival.start_date);
  const endDate = new Date(festival.end_date);
  const dateRange = `${startDate.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  })} - ${endDate.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  // Check if currently active
  const now = new Date();
  const isActive = startDate <= now && endDate >= now;

  // Lead organizer
  const leadOrganizer = festival.festival_organizers?.find(
    (fo) => fo.role === "lead"
  );

  return (
    <Link
      href={`/festivals/${festival.slug}`}
      className={`group block rounded-xl border bg-card overflow-hidden hover:border-primary/50 transition-all ${
        isPast ? "opacity-70 hover:opacity-100" : ""
      }`}
    >
      {/* Cover Image */}
      <div className="relative aspect-[16/9]">
        {festival.cover_image_url ? (
          <Image
            src={festival.cover_image_url}
            alt={festival.title}
            fill
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        {isActive && (
          <div className="absolute top-3 left-3 px-2 py-1 rounded bg-green-500 text-white text-xs font-medium">
            {happeningNowLabel}
          </div>
        )}
        {festival.is_featured && !isActive && (
          <div className="absolute top-3 left-3 px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-medium">
            Featured
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <BadgeCheck className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-primary">Official</span>
        </div>
        <h3 className="font-semibold text-lg mb-1 line-clamp-1">
          {festival.title}
        </h3>
        {festival.subtitle && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
            {festival.subtitle}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{dateRange}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span>{festival.location_city}</span>
          </div>
        </div>

        {/* Lead Organizer */}
        {leadOrganizer?.organizers && (
          <div className="mt-4 pt-4 border-t flex items-center gap-2">
            {leadOrganizer.organizers.logo_url ? (
              <Image
                src={leadOrganizer.organizers.logo_url}
                alt={leadOrganizer.organizers.name}
                width={24}
                height={24}
                className="rounded"
              />
            ) : (
              <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">
                  {leadOrganizer.organizers.name[0]}
                </span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">
              by {leadOrganizer.organizers.name}
            </span>
            {leadOrganizer.organizers.is_verified && (
              <BadgeCheck className="h-3 w-3 text-primary" />
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
