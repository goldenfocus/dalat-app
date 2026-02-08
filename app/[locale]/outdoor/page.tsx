import { Suspense } from "react";
import { Sun } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { VenueCard } from "@/components/venues/venue-card";
import { VenueCardSkeleton } from "@/components/venues/venue-card-skeleton";
import { Link } from "@/lib/i18n/routing";
import type { VenueListItem, Locale } from "@/lib/types";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateFAQSchema } from "@/lib/structured-data";
import { locales } from "@/lib/i18n/routing";
import { SITE_DOMAIN, SITE_URL } from "@/lib/constants";
const VENUE_TYPE = "outdoor" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === "vi"
    ? "Hoạt Động Ngoài Trời Đà Lạt - Sự Kiện & Địa Điểm"
    : "Outdoor Activities in Da Lat - Events & Venues";

  const description = locale === "vi"
    ? "Khám phá các địa điểm ngoài trời ở Đà Lạt tổ chức sự kiện, festival và hoạt động thiên nhiên. Trải nghiệm cao nguyên tuyệt vời."
    : "Discover outdoor venues in Da Lat hosting events, festivals, and nature activities. Experience the beautiful highlands.";

  return generateLocalizedMetadata({
    locale,
    path: "/outdoor",
    title,
    description,
    keywords: [
      "Da Lat outdoor",
      "outdoor activities Da Lat",
      "nature events Da Lat",
      "hiking Da Lat",
      "adventure Vietnam",
      "Đà Lạt ngoài trời",
      "hoạt động thiên nhiên Đà Lạt",
    ],
  });
}

async function getVenuesByType(): Promise<VenueListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_venues_for_discovery", {
    p_type: VENUE_TYPE,
    p_limit: 100,
    p_offset: 0,
  });

  if (error) {
    console.error("Error fetching venues:", error);
    return [];
  }

  return (data || []) as VenueListItem[];
}

function VenuesLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[...Array(4)].map((_, i) => (
        <VenueCardSkeleton key={i} />
      ))}
    </div>
  );
}

async function OutdoorContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");

  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Outdoor", url: "/outdoor" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Địa Điểm Ngoài Trời Đà Lạt" : "Outdoor Venues in Da Lat",
    description: locale === "vi"
      ? "Danh sách địa điểm ngoài trời tổ chức sự kiện tại Đà Lạt, Việt Nam"
      : "Outdoor venues hosting events in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "Place",
        name: venue.name,
        address: {
          "@type": "PostalAddress",
          addressLocality: "Da Lat",
          addressRegion: "Lam Dong",
          addressCountry: "VN",
        },
        ...(venue.address && { streetAddress: venue.address }),
      },
    })),
  };

  const faqSchema = generateFAQSchema(
    locale === "vi"
      ? [
          {
            question: "Đà Lạt có những hoạt động ngoài trời nào?",
            answer: `Có ${venues.length} địa điểm ngoài trời trên ${SITE_DOMAIN} tổ chức các hoạt động như hiking, camping, festival và sự kiện thiên nhiên.`,
          },
          {
            question: "Thời điểm tốt nhất để tham gia hoạt động ngoài trời ở Đà Lạt?",
            answer: "Đà Lạt có khí hậu mát mẻ quanh năm, nhưng mùa khô (tháng 11-4) là thời điểm lý tưởng nhất cho các hoạt động ngoài trời.",
          },
        ]
      : [
          {
            question: "What outdoor activities are in Da Lat?",
            answer: `There are ${venues.length} outdoor venues on ${SITE_DOMAIN} hosting activities like hiking, camping, festivals, and nature events.`,
          },
          {
            question: "When is the best time for outdoor activities in Da Lat?",
            answer: "Da Lat has cool weather year-round, but the dry season (November-April) is ideal for outdoor activities.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema, faqSchema]} />

      <p className="text-muted-foreground mb-6">
        {locale === "vi" ? (
          <>
            Khám phá <strong>{venues.length} địa điểm ngoài trời</strong> tại Đà Lạt.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> đang có sự kiện ngay bây giờ.</>
            )}
          </>
        ) : (
          <>
            Discover <strong>{venues.length} outdoor venues</strong> in Da Lat.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> have events happening now.</>
            )}
          </>
        )}
      </p>

      {venues.length === 0 ? (
        <div className="text-center py-16">
          <Sun className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-1">
            {t("noVenues")}
          </p>
          <p className="text-sm text-muted-foreground/70">
            {t("noVenuesDescription")}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {happeningNow.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                {locale === "vi" ? "Đang có sự kiện" : "Happening Now"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {happeningNow.map((venue) => (
                  <VenueCard key={venue.id} venue={venue} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold mb-4">
              {locale === "vi" ? "Tất cả địa điểm ngoài trời" : "All Outdoor Venues"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {otherVenues.map((venue) => (
                <VenueCard key={venue.id} venue={venue} />
              ))}
            </div>
          </section>
        </div>
      )}

      <nav className="mt-12 pt-8 border-t" aria-label="Explore other venue types">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          {locale === "vi" ? "Khám phá thêm" : "Explore More"}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/parks" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Công viên" : "Parks"}
          </Link>
          <Link href="/festivals" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Lễ hội" : "Festivals"}
          </Link>
          <Link href="/venues" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Tất cả địa điểm" : "All Venues"}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function OutdoorPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Hoạt Động Ngoài Trời Đà Lạt" : "Outdoor Activities in Da Lat"}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <OutdoorContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
