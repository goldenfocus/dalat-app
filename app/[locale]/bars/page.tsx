import { Suspense } from "react";
import { Wine } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { VenueCard } from "@/components/venues/venue-card";
import { VenueCardSkeleton } from "@/components/venues/venue-card-skeleton";
import { Link } from "@/lib/i18n/routing";
import type { VenueListItem, Locale } from "@/lib/types";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateFAQSchema } from "@/lib/structured-data";
import { buildLocales } from "@/lib/i18n/routing";

const SITE_URL = "https://dalat.app";
const VENUE_TYPE = "bar" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

// Generate static pages for all locales
export function generateStaticParams() {
  return buildLocales.map((locale) => ({ locale }));
}

// SEO-optimized metadata targeting "dalat bars" keywords
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const t = await getTranslations({ locale, namespace: "venuePages" });

  return generateLocalizedMetadata({
    locale,
    path: "/bars",
    title: t("bars.metaTitle"),
    description: t("bars.metaDescription"),
    keywords: [
      "Da Lat bars",
      "Dalat nightlife",
      "best bars Da Lat",
      "bars with live music",
      "Da Lat nightclubs",
      "Đà Lạt quán bar",
      "bar Đà Lạt",
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

async function BarsContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");
  const tp = await getTranslations({ locale, namespace: "venuePages" });

  // Separate venues with happening now
  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  // Generate structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Bars", url: "/bars" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Quán Bar Đà Lạt" : "Bars in Da Lat",
    description: locale === "vi"
      ? "Danh sách quán bar và nightlife tại Đà Lạt, Việt Nam"
      : "Bars and nightlife venues in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "BarOrPub",
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
            question: "Đà Lạt có bao nhiêu quán bar tổ chức sự kiện?",
            answer: `Hiện tại có ${venues.length} quán bar trên ĐàLạt.app tổ chức các sự kiện như nhạc sống, DJ và các buổi tiệc.`,
          },
          {
            question: "Quán bar nào ở Đà Lạt đang có sự kiện tối nay?",
            answer: happeningNow.length > 0
              ? `Có ${happeningNow.length} quán bar đang có sự kiện ngay bây giờ: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}${happeningNow.length > 3 ? " và nhiều hơn nữa" : ""}.`
              : "Hiện tại chưa có sự kiện nào. Hãy kiểm tra lại sau hoặc xem các sự kiện sắp tới.",
          },
          {
            question: "Quán bar nào ở Đà Lạt có nhạc sống?",
            answer: "Nhiều quán bar ở Đà Lạt tổ chức nhạc sống hàng tuần. Xem danh sách trên trang này để tìm các địa điểm đang hoạt động.",
          },
        ]
      : [
          {
            question: "How many bars in Da Lat host events?",
            answer: `There are currently ${venues.length} bars on ĐàLạt.app hosting events like live music, DJ nights, and parties.`,
          },
          {
            question: "Which bars in Da Lat have events tonight?",
            answer: happeningNow.length > 0
              ? `${happeningNow.length} bars have events happening right now: ${happeningNow.slice(0, 3).map(v => v.name).join(", ")}${happeningNow.length > 3 ? " and more" : ""}.`
              : "No events are happening right now. Check back later or browse upcoming events.",
          },
          {
            question: "Which bars in Da Lat have live music?",
            answer: "Many bars in Da Lat host live music weekly. Check the list on this page for currently active venues with upcoming events.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema, faqSchema]} />

      {/* SEO-optimized intro paragraph */}
      <p className="text-muted-foreground mb-6">
        {tp.rich("bars.intro", {
          count: venues.length,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
        {happeningNow.length > 0 && (
          <>
            {" "}
            {tp.rich("shared.introHappeningRightNow", {
              count: happeningNow.length,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </>
        )}
      </p>

      {/* Venues grid */}
      {venues.length === 0 ? (
        <div className="text-center py-16">
          <Wine className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
                {tp("shared.happeningNow")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {happeningNow.map((venue) => (
                  <VenueCard key={venue.id} venue={venue} />
                ))}
              </div>
            </section>
          )}

          {/* All Bars */}
          <section>
            <h2 className="text-lg font-semibold mb-4">
              {tp("bars.allHeading")}
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
          {tp("shared.exploreMore")}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/cafes" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {tp("shared.chips.cafes")}
          </Link>
          <Link href="/restaurants" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {tp("shared.chips.restaurants")}
          </Link>
          <Link href="/galleries" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {tp("shared.chips.galleries")}
          </Link>
          <Link href="/venues" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {tp("shared.chips.allVenues")}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function BarsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "venuePages" });

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* SEO-optimized H1 */}
        <h1 className="text-2xl font-bold mb-2">
          {t("bars.h1")}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <BarsContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
