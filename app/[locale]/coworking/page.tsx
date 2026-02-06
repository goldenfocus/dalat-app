import { Suspense } from "react";
import { Laptop } from "lucide-react";
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
const VENUE_TYPE = "coworking" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// SEO-optimized for digital nomads searching "coworking dalat"
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === "vi"
    ? "Coworking Đà Lạt - Không Gian Làm Việc & Sự Kiện"
    : "Coworking Spaces in Da Lat - Work & Events";

  const description = locale === "vi"
    ? "Khám phá các không gian coworking tốt nhất ở Đà Lạt cho digital nomads. WiFi nhanh, cà phê ngon và cộng đồng năng động."
    : "Discover the best coworking spaces in Da Lat for digital nomads. Fast WiFi, great coffee, and vibrant community events.";

  return generateLocalizedMetadata({
    locale,
    path: "/coworking",
    title,
    description,
    keywords: [
      "Da Lat coworking",
      "Dalat digital nomad",
      "coworking space Da Lat",
      "remote work Vietnam",
      "work from Da Lat",
      "Đà Lạt coworking",
      "làm việc từ xa Đà Lạt",
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

async function CoworkingContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");

  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Coworking", url: "/coworking" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Coworking Đà Lạt" : "Coworking Spaces in Da Lat",
    description: locale === "vi"
      ? "Danh sách không gian coworking tại Đà Lạt, Việt Nam"
      : "Coworking spaces and remote work venues in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "LocalBusiness",
        "@additionalType": "https://schema.org/CoworkingSpace",
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

  // FAQ optimized for digital nomad queries
  const faqSchema = generateFAQSchema(
    locale === "vi"
      ? [
          {
            question: "Đà Lạt có bao nhiêu không gian coworking?",
            answer: `Hiện tại có ${venues.length} không gian coworking trên ĐàLạt.app với WiFi nhanh và không gian làm việc thoải mái.`,
          },
          {
            question: "Đà Lạt có phù hợp cho digital nomads không?",
            answer: "Đà Lạt là điểm đến lý tưởng cho digital nomads với khí hậu mát mẻ, chi phí sinh hoạt thấp, nhiều quán cà phê có WiFi tốt và cộng đồng expat thân thiện.",
          },
          {
            question: "Coworking space nào ở Đà Lạt có sự kiện?",
            answer: happeningNow.length > 0
              ? `Có ${happeningNow.length} coworking space đang có sự kiện: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}.`
              : "Xem danh sách để tìm các sự kiện networking và workshop sắp tới.",
          },
        ]
      : [
          {
            question: "How many coworking spaces are in Da Lat?",
            answer: `There are currently ${venues.length} coworking spaces on ĐàLạt.app with fast WiFi and comfortable work environments.`,
          },
          {
            question: "Is Da Lat good for digital nomads?",
            answer: "Da Lat is an ideal destination for digital nomads with cool climate, low cost of living, many cafes with good WiFi, and a friendly expat community.",
          },
          {
            question: "Which coworking spaces in Da Lat have events?",
            answer: happeningNow.length > 0
              ? `${happeningNow.length} coworking spaces have events now: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}.`
              : "Check the list for upcoming networking events and workshops.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema, faqSchema]} />

      <p className="text-muted-foreground mb-6">
        {locale === "vi" ? (
          <>
            Khám phá <strong>{venues.length} không gian coworking</strong> tại Đà Lạt.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> đang có sự kiện ngay bây giờ.</>
            )}
          </>
        ) : (
          <>
            Discover <strong>{venues.length} coworking spaces</strong> in Da Lat.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> have events happening now.</>
            )}
          </>
        )}
      </p>

      {venues.length === 0 ? (
        <div className="text-center py-16">
          <Laptop className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
                {locale === "vi" ? "Đang có sự kiện" : "Events Now"}
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
              {locale === "vi" ? "Tất cả coworking" : "All Coworking Spaces"}
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
          <Link href="/cafes" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Quán Cà Phê" : "Cafes"}
          </Link>
          <Link href="/community-centers" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Trung Tâm Cộng Đồng" : "Community Centers"}
          </Link>
          <Link href="/venues" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Tất cả địa điểm" : "All Venues"}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function CoworkingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Coworking Đà Lạt" : "Coworking Spaces in Da Lat"}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <CoworkingContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
