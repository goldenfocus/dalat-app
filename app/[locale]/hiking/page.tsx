import { Suspense } from "react";
import { Mountain } from "lucide-react";
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
const VENUE_TYPE = "hiking" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === "vi"
    ? "Leo Núi & Trekking Đà Lạt - Đường Mòn & Địa Điểm"
    : "Hiking & Trekking in Da Lat - Trails & Spots";

  const description = locale === "vi"
    ? "Khám phá các đường mòn leo núi đẹp nhất Đà Lạt. Từ đỉnh Langbiang đến Vườn Quốc gia Bidoup, trải nghiệm thiên nhiên cao nguyên tuyệt vời."
    : "Discover the best hiking trails in Da Lat. From Langbiang Peak to Bidoup National Park, experience the stunning highland nature.";

  return generateLocalizedMetadata({
    locale,
    path: "/hiking",
    title,
    description,
    keywords: [
      "hiking Da Lat", "trekking Da Lat", "Da Lat trails",
      "Langbiang hiking", "Bidoup National Park",
      "leo núi Đà Lạt", "trekking Đà Lạt", "đường mòn Đà Lạt",
      "best hikes Vietnam highlands",
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

async function HikingContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");

  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Hiking", url: "/hiking" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Leo Núi & Trekking Đà Lạt" : "Hiking Trails in Da Lat",
    description: locale === "vi"
      ? "Danh sách các đường mòn và điểm leo núi tốt nhất tại Đà Lạt, Việt Nam"
      : "Best hiking trails and trekking spots in Da Lat, Vietnam",
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
            question: "Đà Lạt có những đường mòn leo núi nào?",
            answer: `Có ${venues.length} điểm leo núi trên ĐàLạt.app bao gồm đỉnh Langbiang, Vườn Quốc gia Bidoup-Núi Bà, và Thác Hang Cọp.`,
          },
          {
            question: "Thời điểm tốt nhất để leo núi ở Đà Lạt?",
            answer: "Mùa khô (tháng 11-4) là thời điểm lý tưởng. Nhiệt độ mát mẻ 15-25°C, ít mưa và đường mòn khô ráo.",
          },
          {
            question: "Leo núi Langbiang mất bao lâu?",
            answer: "Leo đỉnh Langbiang (2,167m) mất khoảng 3-4 giờ khứ hồi. Đường mòn có độ khó trung bình, phù hợp với người mới bắt đầu.",
          },
        ]
      : [
          {
            question: "What hiking trails are in Da Lat?",
            answer: `There are ${venues.length} hiking spots on ĐàLạt.app including Langbiang Peak, Bidoup-Nui Ba National Park, and Tiger Cave Waterfall.`,
          },
          {
            question: "When is the best time to hike in Da Lat?",
            answer: "The dry season (November-April) is ideal. Temperatures are cool at 15-25°C with little rain and dry trails.",
          },
          {
            question: "How long does it take to hike Langbiang?",
            answer: "Hiking Langbiang Peak (2,167m) takes about 3-4 hours round trip. The trail is moderate difficulty, suitable for beginners.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema, faqSchema]} />

      <p className="text-muted-foreground mb-6">
        {locale === "vi" ? (
          <>
            Khám phá <strong>{venues.length} điểm leo núi & trekking</strong> tại Đà Lạt.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> đang có sự kiện ngay bây giờ.</>
            )}
          </>
        ) : (
          <>
            Discover <strong>{venues.length} hiking trails & trekking spots</strong> in Da Lat.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> have events happening now.</>
            )}
          </>
        )}
      </p>

      {venues.length === 0 ? (
        <div className="text-center py-16">
          <Mountain className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
              {locale === "vi" ? "Tất cả điểm leo núi" : "All Hiking Spots"}
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
          <Link href="/outdoor" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Ngoài trời" : "Outdoor"}
          </Link>
          <Link href="/parks" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Công viên" : "Parks"}
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

export default async function HikingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Leo Núi & Trekking Đà Lạt" : "Hiking & Trekking in Da Lat"}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <HikingContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
