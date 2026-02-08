import { Suspense } from "react";
import { Coffee } from "lucide-react";
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
const VENUE_TYPE = "cafe" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

// Generate static pages for all locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// SEO-optimized metadata targeting "dalat cafes" keywords
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === "vi"
    ? "Quán Cà Phê Đà Lạt - Địa Điểm Tổ Chức Sự Kiện"
    : "Cafes in Da Lat - Coffee Shops & Event Venues";

  const description = locale === "vi"
    ? "Khám phá các quán cà phê tốt nhất ở Đà Lạt với sự kiện trực tiếp, nhạc sống và không gian làm việc. Cập nhật hàng ngày với các sự kiện đang diễn ra."
    : "Discover the best cafes in Da Lat hosting live events, music, and community gatherings. Updated daily with what's happening now.";

  return generateLocalizedMetadata({
    locale,
    path: "/cafes",
    title,
    description,
    keywords: [
      "Da Lat cafes",
      "Dalat coffee shops",
      "best cafes Da Lat",
      "coffee Da Lat Vietnam",
      "cafes with events",
      "Đà Lạt quán cà phê",
      "cà phê Đà Lạt",
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

async function CafesContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");

  // Separate venues with happening now
  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  // Generate structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Cafes", url: "/cafes" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Quán Cà Phê Đà Lạt" : "Cafes in Da Lat",
    description: locale === "vi"
      ? "Danh sách quán cà phê tổ chức sự kiện tại Đà Lạt, Việt Nam"
      : "Coffee shops and cafes hosting events in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "CafeOrCoffeeShop",
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

  // FAQ schema for AEO (AI Engine Optimization)
  const faqSchema = generateFAQSchema(
    locale === "vi"
      ? [
          {
            question: "Đà Lạt có bao nhiêu quán cà phê tổ chức sự kiện?",
            answer: `Hiện tại có ${venues.length} quán cà phê trên ${SITE_DOMAIN} tổ chức các sự kiện như nhạc sống, triển lãm nghệ thuật và các buổi gặp mặt cộng đồng.`,
          },
          {
            question: "Quán cà phê nào ở Đà Lạt đang có sự kiện hôm nay?",
            answer: happeningNow.length > 0
              ? `Có ${happeningNow.length} quán cà phê đang có sự kiện ngay bây giờ: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}${happeningNow.length > 3 ? " và nhiều hơn nữa" : ""}.`
              : "Hiện tại chưa có sự kiện nào. Hãy kiểm tra lại sau hoặc xem các sự kiện sắp tới.",
          },
          {
            question: "Quán cà phê nào ở Đà Lạt tốt nhất cho du khách?",
            answer: "Các quán cà phê phổ biến nhất với du khách bao gồm những nơi thường xuyên tổ chức sự kiện. Xem danh sách trên trang này để tìm các địa điểm đang hoạt động.",
          },
        ]
      : [
          {
            question: "How many cafes in Da Lat host events?",
            answer: `There are currently ${venues.length} cafes on ${SITE_DOMAIN} hosting events like live music, art exhibitions, and community gatherings.`,
          },
          {
            question: "Which cafes in Da Lat have events today?",
            answer: happeningNow.length > 0
              ? `${happeningNow.length} cafes have events happening right now: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}${happeningNow.length > 3 ? " and more" : ""}.`
              : "No events are happening right now. Check back later or browse upcoming events.",
          },
          {
            question: "What are the best cafes in Da Lat for tourists?",
            answer: "The most popular cafes for visitors are those regularly hosting events. Check the list on this page for currently active venues.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema, faqSchema]} />

      {/* SEO-optimized intro paragraph */}
      <p className="text-muted-foreground mb-6">
        {locale === "vi" ? (
          <>
            Khám phá <strong>{venues.length} quán cà phê</strong> tổ chức sự kiện tại Đà Lạt.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> đang có sự kiện ngay bây giờ.</>
            )}
          </>
        ) : (
          <>
            Discover <strong>{venues.length} cafes</strong> hosting events in Da Lat.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> have events happening right now.</>
            )}
          </>
        )}
      </p>

      {/* Venues grid */}
      {venues.length === 0 ? (
        <div className="text-center py-16">
          <Coffee className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-1">
            {t("noVenues")}
          </p>
          <p className="text-sm text-muted-foreground/70">
            {t("noVenuesDescription")}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Happening Now Section */}
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

          {/* All Cafes */}
          <section>
            <h2 className="text-lg font-semibold mb-4">
              {locale === "vi" ? "Tất cả quán cà phê" : "All Cafes"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {otherVenues.map((venue) => (
                <VenueCard key={venue.id} venue={venue} />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Cross-links to other venue types */}
      <nav className="mt-12 pt-8 border-t" aria-label="Explore other venue types">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          {locale === "vi" ? "Khám phá thêm" : "Explore More"}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/bars" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Quán Bar" : "Bars"}
          </Link>
          <Link href="/galleries" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Phòng tranh" : "Galleries"}
          </Link>
          <Link href="/restaurants" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Nhà hàng" : "Restaurants"}
          </Link>
          <Link href="/venues" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Tất cả địa điểm" : "All Venues"}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function CafesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* SEO-optimized H1 */}
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Quán Cà Phê Đà Lạt" : "Cafes in Da Lat"}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <CafesContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
