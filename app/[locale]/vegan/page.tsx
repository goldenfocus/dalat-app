import { Suspense } from "react";
import { Sprout } from "lucide-react";
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
const VENUE_TYPE = "vegan" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return buildLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const t = await getTranslations({ locale, namespace: "venuePages" });

  return generateLocalizedMetadata({
    locale,
    path: "/vegan",
    title: t("vegan.metaTitle"),
    description: t("vegan.metaDescription"),
    keywords: [
      "vegan Da Lat", "vegan restaurants Da Lat",
      "nhà hàng thuần chay Đà Lạt", "ẩm thực thuần chay",
      "plant-based Da Lat", "vegan food Vietnam",
      "vegan Vietnamese cuisine", "100% thực vật Đà Lạt",
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

async function VeganContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");
  const tp = await getTranslations({ locale, namespace: "venuePages" });

  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: locale === "vi" ? "Thuần Chay" : "Vegan", url: "/vegan" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Nhà Hàng Thuần Chay Đà Lạt" : "Vegan Restaurants in Da Lat",
    description: locale === "vi"
      ? "Danh sách nhà hàng thuần chay tốt nhất tại Đà Lạt, Việt Nam"
      : "Best vegan restaurants in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "Restaurant",
        name: venue.name,
        servesCuisine: "Vegan",
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
            question: "Đà Lạt có nhà hàng thuần chay không?",
            answer: `Có ${venues.length} nhà hàng thuần chay trên ĐàLạt.app. Đà Lạt có cộng đồng ăn chay lớn nhờ truyền thống Phật giáo và rau quả địa phương.`,
          },
          {
            question: "Đồ ăn thuần chay ở Đà Lạt có ngon không?",
            answer: "Rất ngon! Đà Lạt nổi tiếng với rau quả tươi từ nông trại cao nguyên. Ẩm thực thuần chay ở đây phong phú và đậm đà hương vị.",
          },
        ]
      : [
          {
            question: "Are there vegan restaurants in Da Lat?",
            answer: `There are ${venues.length} vegan restaurants on ĐàLạt.app. Da Lat has a large vegetarian community thanks to Buddhist traditions and fresh local produce.`,
          },
          {
            question: "Is vegan food good in Da Lat?",
            answer: "Absolutely! Da Lat is famous for fresh vegetables from highland farms. Vegan cuisine here is diverse and flavorful.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema, faqSchema]} />

      <p className="text-muted-foreground mb-6">
        {tp.rich("vegan.intro", {
          count: venues.length,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
        {happeningNow.length > 0 && (
          <>
            {" "}
            {tp.rich("shared.introHappeningNow", {
              count: happeningNow.length,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </>
        )}
      </p>

      {venues.length === 0 ? (
        <div className="text-center py-16">
          <Sprout className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
                {tp("shared.happeningNow")}
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
              {tp("vegan.allHeading")}
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
          {tp("shared.exploreMore")}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/vegetarian" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {tp("shared.chips.vegetarian")}
          </Link>
          <Link href="/restaurants" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {tp("shared.chips.restaurants")}
          </Link>
          <Link href="/cafes" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {tp("shared.chips.cafes")}
          </Link>
          <Link href="/venues" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {tp("shared.chips.allVenues")}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function VeganPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "venuePages" });

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {t("vegan.h1")}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <VeganContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
