import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { VenueCard } from "@/components/venues/venue-card";
import { VenueCardSkeleton } from "@/components/venues/venue-card-skeleton";
import { VenueTypeFilter } from "@/components/venues/venue-type-filter";
import type { VenueListItem, VenueType, Locale } from "@/lib/types";
import type { Metadata } from "next";
import { generateLocalizedMetadata } from "@/lib/metadata";

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
}

async function VenuesContent({ selectedType }: VenuesContentProps) {
  const allVenues = await getAllVenues();
  const t = await getTranslations("venues");

  // Compute type counts from all venues
  const typeCounts = computeTypeCounts(allVenues);

  // Filter venues by selected type
  const filteredVenues = selectedType
    ? allVenues.filter((v) => v.venue_type === selectedType)
    : allVenues;

  // Separate venues with happening now
  const happeningNow = filteredVenues.filter((v) => v.has_happening_now);
  const otherVenues = filteredVenues.filter((v) => !v.has_happening_now);

  return (
    <>
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
                  <VenueCard key={venue.id} venue={venue} />
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
                <VenueCard key={venue.id} venue={venue} />
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
      <SiteHeader />

      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* Page title */}
        <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

        {/* Content with filter and grid */}
        <Suspense fallback={<VenuesLoading />}>
          <VenuesContent selectedType={selectedType} />
        </Suspense>
      </div>
    </main>
  );
}
