import { Suspense } from "react";
import { Users } from "lucide-react";
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
const VENUE_TYPE = "community_center" as const;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === "vi"
    ? "Trung Tâm Cộng Đồng Đà Lạt - Sự Kiện & Hoạt Động"
    : "Community Centers in Da Lat - Events & Activities";

  const description = locale === "vi"
    ? "Khám phá các trung tâm cộng đồng ở Đà Lạt tổ chức sự kiện, workshop và hoạt động nhóm. Kết nối với cộng đồng địa phương."
    : "Discover community centers in Da Lat hosting events, workshops, and group activities. Connect with the local community.";

  return generateLocalizedMetadata({
    locale,
    path: "/community-centers",
    title,
    description,
    keywords: [
      "Da Lat community",
      "community centers Da Lat",
      "local events Da Lat",
      "workshops Vietnam",
      "Đà Lạt cộng đồng",
      "trung tâm văn hóa Đà Lạt",
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

async function CommunityCentersContent({ locale }: { locale: Locale }) {
  const venues = await getVenuesByType();
  const t = await getTranslations("venues");

  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Community Centers", url: "/community-centers" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Trung Tâm Cộng Đồng Đà Lạt" : "Community Centers in Da Lat",
    description: locale === "vi"
      ? "Danh sách trung tâm cộng đồng tại Đà Lạt, Việt Nam"
      : "Community centers and civic spaces in Da Lat, Vietnam",
    numberOfItems: venues.length,
    itemListElement: venues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "CivicStructure",
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
            question: "Đà Lạt có những trung tâm cộng đồng nào?",
            answer: `Hiện tại có ${venues.length} trung tâm cộng đồng trên ĐàLạt.app tổ chức các sự kiện, workshop và hoạt động nhóm.`,
          },
          {
            question: "Làm sao để tham gia cộng đồng ở Đà Lạt?",
            answer: "Bạn có thể tham gia các sự kiện tại các trung tâm cộng đồng, workshop, nhóm sở thích và các buổi gặp mặt. Xem danh sách sự kiện trên ĐàLạt.app.",
          },
        ]
      : [
          {
            question: "What community centers are in Da Lat?",
            answer: `There are currently ${venues.length} community centers on ĐàLạt.app hosting events, workshops, and group activities.`,
          },
          {
            question: "How do I join the community in Da Lat?",
            answer: "You can join events at community centers, workshops, hobby groups, and meetups. Check the event listings on ĐàLạt.app.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema, faqSchema]} />

      <p className="text-muted-foreground mb-6">
        {locale === "vi" ? (
          <>
            Khám phá <strong>{venues.length} trung tâm cộng đồng</strong> tại Đà Lạt.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> đang có sự kiện ngay bây giờ.</>
            )}
          </>
        ) : (
          <>
            Discover <strong>{venues.length} community centers</strong> in Da Lat.
            {happeningNow.length > 0 && (
              <> <strong>{happeningNow.length}</strong> have events happening now.</>
            )}
          </>
        )}
      </p>

      {venues.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
              {locale === "vi" ? "Tất cả trung tâm cộng đồng" : "All Community Centers"}
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
          <Link href="/coworking" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Coworking" : "Coworking"}
          </Link>
          <Link href="/galleries" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Phòng tranh" : "Galleries"}
          </Link>
          <Link href="/venues" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Tất cả địa điểm" : "All Venues"}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function CommunityCentersPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Trung Tâm Cộng Đồng Đà Lạt" : "Community Centers in Da Lat"}
        </h1>

        <Suspense fallback={<VenuesLoading />}>
          <CommunityCentersContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
