import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createStaticClient } from "@/lib/supabase/server";
import { getVenueTranslationsBatch } from "@/lib/translations";
import { VenueCardSkeleton } from "@/components/venues/venue-card-skeleton";
import { VenuesDirectory } from "@/components/venues/venues-directory";
import type { VenueListItem, VenueType, Locale } from "@/lib/types";
import type { Metadata } from "next";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";

const SITE_URL = "https://dalat.app";

// ISR: Revalidate every 5 minutes (type filter is applied client-side)
export const revalidate = 300;

type PageProps = {
  params: Promise<{ locale: Locale }>;
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
  const supabase = createStaticClient();
  if (!supabase) {
    console.error("[venues] createStaticClient returned null — NEXT_PUBLIC_SUPABASE_* env missing; rendering empty directory");
    return [];
  }

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

async function VenuesContent({ locale }: { locale: Locale }) {
  const allVenues = await getAllVenues();

  // Fetch venue translations for current locale
  const venueIds = allVenues.map((v) => v.id);
  const venueTranslations = await getVenueTranslationsBatch(venueIds, locale);

  // Serialize translations for the client boundary (Maps aren't serializable)
  const translatedNames: Record<string, string> = {};
  venueTranslations.forEach((translation, id) => {
    if (translation.title) translatedNames[id] = translation.title;
  });

  // Compute type counts from all venues
  const typeCounts = computeTypeCounts(allVenues);

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
    numberOfItems: allVenues.length,
    itemListElement: allVenues.slice(0, 50).map((venue, index) => ({
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
      {/* useSearchParams (type filter) needs its own Suspense boundary for static rendering */}
      <Suspense fallback={<VenuesLoading />}>
        <VenuesDirectory
          venues={allVenues}
          translatedNames={translatedNames}
          typeCounts={typeCounts}
        />
      </Suspense>
    </>
  );
}

export default async function VenuesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("venues");

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* Page title */}
        <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

        {/* Content with filter and grid */}
        <Suspense fallback={<VenuesLoading />}>
          <VenuesContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
