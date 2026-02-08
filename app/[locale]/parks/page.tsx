import { Suspense } from "react";
import { TreePine } from "lucide-react";
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
const VENUE_TYPE = "park" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

// Generate static pages for all locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// SEO-optimized metadata targeting "dalat parks" keywords
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === "vi"
    ? "Công Viên Đà Lạt - Thiên Nhiên & Sự Kiện Ngoài Trời"
    : "Parks in Da Lat - Nature & Outdoor Events";

  const description = locale === "vi"
    ? "Khám phá các công viên và không gian xanh tốt nhất ở Đà Lạt. Sự kiện ngoài trời, picnic và hoạt động thiên nhiên cập nhật hàng ngày."
    : "Discover the best parks and green spaces in Da Lat. Outdoor events, picnics, and nature activities updated daily.";

  return generateLocalizedMetadata({
    locale,
    path: "/parks",
    title,
    description,
    keywords: [
      "Da Lat parks",
      "Dalat nature",
      "parks Da Lat",
      "outdoor activities Da Lat",
      "green spaces Vietnam",
      "Đà Lạt công viên",
      "thiên nhiên Đà Lạt",
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

async function ParksContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");

  // Separate venues with happening now
  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  // Generate structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Parks", url: "/parks" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Công Viên Đà Lạt" : "Parks in Da Lat",
    description: locale === "vi"
      ? "Danh sách công viên và không gian xanh tại Đà Lạt, Việt Nam"
      : "Parks and green spaces in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "Park",
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

  // FAQ schema for AEO
  const faqSchema = generateFAQSchema(
    locale === "vi"
      ? [
          {
            question: "Đà Lạt có bao nhiêu công viên tổ chức sự kiện?",
            answer: `Hiện tại có ${venues.length} công viên và không gian xanh trên ${SITE_DOMAIN} tổ chức các sự kiện ngoài trời.`,
          },
          {
            question: "Công viên nào ở Đà Lạt đang có sự kiện?",
            answer: happeningNow.length > 0
              ? `Có ${happeningNow.length} công viên đang có sự kiện ngay bây giờ: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}${happeningNow.length > 3 ? " và nhiều hơn nữa" : ""}.`
              : "Hiện tại chưa có sự kiện nào. Hãy kiểm tra lại sau hoặc xem các sự kiện sắp tới.",
          },
          {
            question: "Công viên nào ở Đà Lạt đẹp nhất?",
            answer: "Đà Lạt nổi tiếng với thiên nhiên tươi đẹp. Các công viên thường có hồ, rừng thông và vườn hoa. Xem danh sách để tìm nơi phù hợp nhất.",
          },
        ]
      : [
          {
            question: "How many parks in Da Lat host events?",
            answer: `There are currently ${venues.length} parks and green spaces on ${SITE_DOMAIN} hosting outdoor events.`,
          },
          {
            question: "Which parks in Da Lat have events now?",
            answer: happeningNow.length > 0
              ? `${happeningNow.length} parks have events happening right now: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}${happeningNow.length > 3 ? " and more" : ""}.`
              : "No events are happening right now. Check back later or browse upcoming events.",
          },
          {
            question: "What are the best parks in Da Lat?",
            answer: "Da Lat is famous for its beautiful nature. Parks typically feature lakes, pine forests, and flower gardens. Check the list to find your perfect spot.",
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
            Khám phá <strong>{venues.length} công viên</strong> và không gian xanh tại Đà Lạt.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> đang có sự kiện ngay bây giờ.</>
            )}
          </>
        ) : (
          <>
            Discover <strong>{venues.length} parks</strong> and green spaces in Da Lat.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> have events happening now.</>
            )}
          </>
        )}
      </p>

      {/* Venues grid */}
      {venues.length === 0 ? (
        <div className="text-center py-16">
          <TreePine className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
              {locale === "vi" ? "Tất cả công viên" : "All Parks"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {otherVenues.map((venue) => (
                <VenueCard key={venue.id} venue={venue} />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Cross-links */}
      <nav className="mt-12 pt-8 border-t" aria-label="Explore other venue types">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          {locale === "vi" ? "Khám phá thêm" : "Explore More"}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/outdoor" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Ngoài Trời" : "Outdoor"}
          </Link>
          <Link href="/cafes" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Quán Cà Phê" : "Cafes"}
          </Link>
          <Link href="/venues" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Tất cả địa điểm" : "All Venues"}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function ParksPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Công Viên Đà Lạt" : "Parks in Da Lat"}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <ParksContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
