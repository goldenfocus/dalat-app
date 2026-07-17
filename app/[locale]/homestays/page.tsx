import { Suspense } from "react";
import { Home } from "lucide-react";
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
const VENUE_TYPE = "homestay" as const;

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
    path: "/homestays",
    title: t("homestays.metaTitle"),
    description: t("homestays.metaDescription"),
    keywords: [
      "Da Lat homestay",
      "Dalat local stay",
      "homestays Da Lat",
      "accommodation Da Lat",
      "local experience Vietnam",
      "Đà Lạt homestay",
      "lưu trú Đà Lạt",
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

async function HomestaysContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");
  const tp = await getTranslations({ locale, namespace: "venuePages" });

  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Homestays", url: "/homestays" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Homestay Đà Lạt" : "Homestays in Da Lat",
    description: locale === "vi"
      ? "Danh sách homestay tại Đà Lạt, Việt Nam"
      : "Homestays and local accommodation in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "LodgingBusiness",
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
            question: "Đà Lạt có bao nhiêu homestay tổ chức sự kiện?",
            answer: `Có ${venues.length} homestay trên ĐàLạt.app tổ chức các sự kiện và hoạt động cộng đồng.`,
          },
          {
            question: "Homestay ở Đà Lạt có gì đặc biệt?",
            answer: "Homestay Đà Lạt mang đến trải nghiệm địa phương độc đáo với không gian ấm cúng, chủ nhà thân thiện và cơ hội tìm hiểu văn hóa địa phương.",
          },
        ]
      : [
          {
            question: "How many homestays in Da Lat host events?",
            answer: `There are ${venues.length} homestays on ĐàLạt.app hosting events and community activities.`,
          },
          {
            question: "What makes Da Lat homestays special?",
            answer: "Da Lat homestays offer unique local experiences with cozy spaces, friendly hosts, and opportunities to learn about local culture.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema, faqSchema]} />

      <p className="text-muted-foreground mb-6">
        {tp.rich("homestays.intro", {
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
          <Home className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
              {tp("homestays.allHeading")}
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
          <Link href="/hotels" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {tp("shared.chips.hotels")}
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

export default async function HomestaysPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "venuePages" });

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {t("homestays.h1")}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <HomestaysContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
