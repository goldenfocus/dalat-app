import { Suspense } from "react";
import { Palette } from "lucide-react";
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
const VENUE_TYPE = "gallery" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

// Generate static pages for all locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// SEO-optimized metadata targeting "dalat galleries" keywords
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === "vi"
    ? "Phòng Tranh Đà Lạt - Gallery & Triển Lãm Nghệ Thuật"
    : "Art Galleries in Da Lat - Exhibitions & Art Spaces";

  const description = locale === "vi"
    ? "Khám phá các phòng tranh và không gian nghệ thuật tốt nhất ở Đà Lạt. Triển lãm, sự kiện nghệ thuật và văn hóa cập nhật hàng ngày."
    : "Discover the best art galleries and creative spaces in Da Lat. Art exhibitions, cultural events, and artist showcases updated daily.";

  return generateLocalizedMetadata({
    locale,
    path: "/galleries",
    title,
    description,
    keywords: [
      "Da Lat galleries",
      "Dalat art",
      "art galleries Da Lat",
      "exhibitions Da Lat",
      "art spaces Vietnam",
      "Đà Lạt phòng tranh",
      "triển lãm nghệ thuật Đà Lạt",
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

async function GalleriesContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");

  // Separate venues with happening now
  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  // Generate structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Galleries", url: "/galleries" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Phòng Tranh Đà Lạt" : "Art Galleries in Da Lat",
    description: locale === "vi"
      ? "Danh sách phòng tranh và không gian nghệ thuật tại Đà Lạt, Việt Nam"
      : "Art galleries and creative spaces in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "ArtGallery",
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
            question: "Đà Lạt có bao nhiêu phòng tranh?",
            answer: `Hiện tại có ${venues.length} phòng tranh và không gian nghệ thuật trên ${SITE_DOMAIN} tổ chức các triển lãm và sự kiện nghệ thuật.`,
          },
          {
            question: "Phòng tranh nào ở Đà Lạt đang có triển lãm?",
            answer: happeningNow.length > 0
              ? `Có ${happeningNow.length} phòng tranh đang có triển lãm ngay bây giờ: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}${happeningNow.length > 3 ? " và nhiều hơn nữa" : ""}.`
              : "Hiện tại chưa có triển lãm nào. Hãy kiểm tra lại sau hoặc xem các sự kiện sắp tới.",
          },
          {
            question: "Nghệ thuật Đà Lạt có gì đặc biệt?",
            answer: "Đà Lạt là trung tâm nghệ thuật của Tây Nguyên với nhiều họa sĩ và nghệ nhân. Các phòng tranh thường trưng bày tranh phong cảnh, nghệ thuật đương đại và thủ công mỹ nghệ địa phương.",
          },
        ]
      : [
          {
            question: "How many art galleries are in Da Lat?",
            answer: `There are currently ${venues.length} art galleries and creative spaces on ${SITE_DOMAIN} hosting exhibitions and art events.`,
          },
          {
            question: "Which galleries in Da Lat have exhibitions now?",
            answer: happeningNow.length > 0
              ? `${happeningNow.length} galleries have exhibitions happening right now: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}${happeningNow.length > 3 ? " and more" : ""}.`
              : "No exhibitions are happening right now. Check back later or browse upcoming events.",
          },
          {
            question: "What makes Da Lat's art scene special?",
            answer: "Da Lat is the artistic heart of Vietnam's Central Highlands, home to many painters and artisans. Galleries typically showcase landscape paintings, contemporary art, and local handicrafts.",
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
            Khám phá <strong>{venues.length} phòng tranh</strong> và không gian nghệ thuật tại Đà Lạt.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> đang có triển lãm ngay bây giờ.</>
            )}
          </>
        ) : (
          <>
            Discover <strong>{venues.length} galleries</strong> and art spaces in Da Lat.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> have exhibitions happening now.</>
            )}
          </>
        )}
      </p>

      {/* Venues grid */}
      {venues.length === 0 ? (
        <div className="text-center py-16">
          <Palette className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
                {locale === "vi" ? "Đang có triển lãm" : "Exhibitions Now"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {happeningNow.map((venue) => (
                  <VenueCard key={venue.id} venue={venue} />
                ))}
              </div>
            </section>
          )}

          {/* All Galleries */}
          <section>
            <h2 className="text-lg font-semibold mb-4">
              {locale === "vi" ? "Tất cả phòng tranh" : "All Galleries"}
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
          <Link href="/cafes" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Quán Cà Phê" : "Cafes"}
          </Link>
          <Link href="/bars" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Quán Bar" : "Bars"}
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

export default async function GalleriesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* SEO-optimized H1 */}
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Phòng Tranh Đà Lạt" : "Art Galleries in Da Lat"}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <GalleriesContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
