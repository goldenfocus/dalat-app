import { Suspense } from "react";
import { Leaf } from "lucide-react";
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

const SITE_URL = "https://dalat.app";
const VENUE_TYPE = "vegetarian" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === "vi"
    ? "Nhà Hàng Chay Đà Lạt - Cơm Chay & Ẩm Thực Chay"
    : "Vegetarian Restaurants in Da Lat - Plant-Based Dining";

  const description = locale === "vi"
    ? "Khám phá các nhà hàng chay ngon nhất Đà Lạt. Cơm chay, phở chay, buffet chay và nhiều món ăn chay truyền thống Việt Nam."
    : "Discover the best vegetarian restaurants in Da Lat. Traditional Vietnamese vegetarian cuisine, buffets, and plant-based dining.";

  return generateLocalizedMetadata({
    locale,
    path: "/vegetarian",
    title,
    description,
    keywords: [
      "vegetarian Da Lat", "vegetarian restaurants Da Lat",
      "nhà hàng chay Đà Lạt", "cơm chay Đà Lạt",
      "best vegetarian food Da Lat", "plant-based Da Lat",
      "Vietnamese vegetarian cuisine", "ẩm thực chay Đà Lạt",
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

async function VegetarianContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");

  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: locale === "vi" ? "Nhà Hàng Chay" : "Vegetarian", url: "/vegetarian" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Nhà Hàng Chay Đà Lạt" : "Vegetarian Restaurants in Da Lat",
    description: locale === "vi"
      ? "Danh sách nhà hàng chay ngon nhất tại Đà Lạt, Việt Nam"
      : "Best vegetarian restaurants in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "Restaurant",
        name: venue.name,
        servesCuisine: "Vegetarian",
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
            question: "Đà Lạt có nhà hàng chay nào ngon?",
            answer: `Có ${venues.length} nhà hàng chay trên ĐàLạt.app. Các quán nổi tiếng gồm Cơm Chay Âu Lạc, Ân Lạc Tâm, và Rau DAWA.`,
          },
          {
            question: "Nhà hàng chay ở Đà Lạt có đắt không?",
            answer: "Hầu hết nhà hàng chay ở Đà Lạt rất bình dân, từ 15,000-50,000đ/món. Buffet chay khoảng 100,000-150,000đ.",
          },
          {
            question: "Tại sao Đà Lạt có nhiều nhà hàng chay?",
            answer: "Đà Lạt có nhiều chùa Phật giáo và cộng đồng ăn chay lớn. Rau quả địa phương tươi ngon cũng khiến ẩm thực chay phong phú.",
          },
        ]
      : [
          {
            question: "What are the best vegetarian restaurants in Da Lat?",
            answer: `There are ${venues.length} vegetarian restaurants on ĐàLạt.app. Popular ones include Cơm Chay Âu Lạc, Ân Lạc Tâm, and Rau DAWA.`,
          },
          {
            question: "Is vegetarian food expensive in Da Lat?",
            answer: "Most vegetarian restaurants in Da Lat are very affordable, from 15,000-50,000 VND per dish. Vegetarian buffets cost around 100,000-150,000 VND.",
          },
          {
            question: "Why does Da Lat have so many vegetarian restaurants?",
            answer: "Da Lat has many Buddhist temples and a large vegetarian community. Fresh local produce also makes the vegetarian cuisine rich and diverse.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema, faqSchema]} />

      <p className="text-muted-foreground mb-6">
        {locale === "vi" ? (
          <>
            Khám phá <strong>{venues.length} nhà hàng chay</strong> tại Đà Lạt.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> đang có sự kiện ngay bây giờ.</>
            )}
          </>
        ) : (
          <>
            Discover <strong>{venues.length} vegetarian restaurants</strong> in Da Lat.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> have events happening now.</>
            )}
          </>
        )}
      </p>

      {venues.length === 0 ? (
        <div className="text-center py-16">
          <Leaf className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
              {locale === "vi" ? "Tất cả nhà hàng chay" : "All Vegetarian Restaurants"}
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
          <Link href="/vegan" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Thuần chay" : "Vegan"}
          </Link>
          <Link href="/restaurants" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Nhà hàng" : "Restaurants"}
          </Link>
          <Link href="/cafes" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Quán cà phê" : "Cafes"}
          </Link>
          <Link href="/venues" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Tất cả địa điểm" : "All Venues"}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function VegetarianPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Nhà Hàng Chay Đà Lạt" : "Vegetarian Restaurants in Da Lat"}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <VegetarianContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
