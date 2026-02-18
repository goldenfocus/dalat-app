import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getVenueTranslationsBatch } from "@/lib/translations";
import { VenueCard } from "@/components/venues/venue-card";
import { VenueCardSkeleton } from "@/components/venues/venue-card-skeleton";
import { VenueTypeFilter } from "@/components/venues/venue-type-filter";
import type { VenueListItem, VenueType, Locale } from "@/lib/types";
import type { Metadata } from "next";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";

const SITE_URL = "https://dalat.app";

type PageProps = {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ type?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  return generateLocalizedMetadata({
    locale,
    path: "/venues",
    title: "Venues",
    description: "Discover cafes, bars, galleries, and more places hosting events in Da Lat",
    keywords: ["venues", "cafes", "bars", "Da Lat", "events", "locations"],
  });
}

async function getAllVenues(): Promise<VenueListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_venues_for_discovery", {
    p_type: null,
    p_limit: 200,
    p_offset: 0,
  });

  if (error) {
    console.error("Error fetching venues:", error);
    return [];
  }

  return (data || []) as VenueListItem[];
}

function computeTypeCounts(venues: VenueListItem[]): Record<VenueType, number> {
  const counts: Record<string, number> = {};
  venues.forEach((venue) => {
    const type = venue.venue_type || "other";
    counts[type] = (counts[type] || 0) + 1;
  });
  return counts as Record<VenueType, number>;
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

interface VenuesContentProps {
  selectedType: VenueType | null;
  locale: Locale;
}

async function VenuesContent({ selectedType, locale }: VenuesContentProps) {
  const allVenues = await getAllVenues();
  const t = await getTranslations("venues");

  // Fetch venue translations for current locale
  const venueIds = allVenues.map((v) => v.id);
  const venueTranslations = await getVenueTranslationsBatch(venueIds, locale);

  // Compute type counts from all venues
  const typeCounts = computeTypeCounts(allVenues);

  // Filter venues by selected type
  const filteredVenues = selectedType
    ? allVenues.filter((v) => v.venue_type === selectedType)
    : allVenues;

  // Separate venues with happening now
  const happeningNow = filteredVenues.filter((v) => v.has_happening_now);
  const otherVenues = filteredVenues.filter((v) => !v.has_happening_now);

  // Generate structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Venues", url: "/venues" },
    ],
    locale
  );

  const venueListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Venues in Da Lat",
    description:
      "Cafes, bars, galleries, and event spaces in Da Lat, Vietnam",
    numberOfItems: filteredVenues.length,
    itemListElement: filteredVenues.slice(0, 50).map((venue, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/venues/${venue.slug}`,
      name: venue.name,
      item: {
        "@type": "LocalBusiness",
        name: venue.name,
        address: {
          "@type": "PostalAddress",
          addressLocality: "Da Lat",
          addressCountry: "VN",
        },
      },
    })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbSchema, venueListSchema]} />
      {/* Type filter - only shows types with venues */}
      <div className="mb-6">
        <VenueTypeFilter selectedType={selectedType} typeCounts={typeCounts} />
      </div>

      {/* Venues grid */}
      {filteredVenues.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
                <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full" />
                {t("happeningNow")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {happeningNow.map((venue) => (
                  <VenueCard
                    key={venue.id}
                    venue={venue}
                    translatedName={venueTranslations.get(venue.id)?.title}
                  />
                ))}
              </div>
            </section>
          )}

          {/* All Venues */}
          <section>
            {happeningNow.length > 0 && (
              <h2 className="text-lg font-semibold mb-4">{t("title")}</h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {otherVenues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  translatedName={venueTranslations.get(venue.id)?.title}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default async function VenuesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { type } = await searchParams;
  const t = await getTranslations("venues");

  // Validate type parameter
  const validTypes = [
    "cafe",
    "bar",
    "restaurant",
    "gallery",
    "park",
    "hotel",
    "coworking",
    "community_center",
    "outdoor",
    "homestay",
    "other",
  ];
  const selectedType = type && validTypes.includes(type) ? (type as VenueType) : null;

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* Page title */}
        <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

        {/* Content with filter and grid */}
        <Suspense fallback={<VenuesLoading />}>
          <VenuesContent selectedType={selectedType} locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
