import type { Metadata } from "next";
import { Link } from "@/lib/i18n/routing";
import Image from "next/image";
import { Calendar, MapPin, BadgeCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Festival, FestivalOrganizer } from "@/lib/types";
import type { Locale } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";

const SITE_URL = "https://dalat.app";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  return generateLocalizedMetadata({
    locale,
    path: "/festivals",
    title: "Festivals in Da Lat",
    description:
      "Discover music festivals, cultural celebrations, flower festivals, and seasonal events in Da Lat, Vietnam. Find dates, venues, and schedules for upcoming festivals.",
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

  const [festivals, tFestival] = await Promise.all([
    getFestivals(),
    getTranslations("festival"),
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
      { name: "Home", url: "/" },
      { name: "Festivals", url: "/festivals" },
    ],
    locale
  );

  const festivalListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Festivals in Da Lat",
    description:
      "Music festivals, cultural celebrations, and seasonal events in Da Lat, Vietnam",
    numberOfItems: festivals.length,
    itemListElement: festivals.slice(0, 50).map((festival, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/festivals/${festival.slug}`,
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
  };

  return (
    <>
      <JsonLd data={[breadcrumbSchema, festivalListSchema]} />
      <div className="min-h-screen">
      <main className="container max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">{tFestival("title")}</h1>
        {/* Active/Upcoming Festivals */}
        {activeFestivals.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{tFestival("activeUpcoming")}</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {activeFestivals.map((festival) => (
                <FestivalCard key={festival.id} festival={festival} />
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
                <FestivalCard key={festival.id} festival={festival} isPast />
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {festivals.length === 0 && (
          <div className="text-center py-20">
            <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-xl font-semibold mb-2">No Festivals Yet</h3>
            <p className="text-muted-foreground">
              Check back soon for upcoming festivals in Đà Lạt!
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
  isPast,
}: {
  festival: Festival & {
    festival_organizers: (FestivalOrganizer & {
      organizers: { id: string; name: string; logo_url: string | null; is_verified: boolean };
    })[];
  };
  isPast?: boolean;
}) {
  const startDate = new Date(festival.start_date);
  const endDate = new Date(festival.end_date);
  const dateRange = `${startDate.toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "short",
  })} - ${endDate.toLocaleDateString("vi-VN", {
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
            Happening Now
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
