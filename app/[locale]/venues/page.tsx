import { Suspense } from "react";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { VenueCard } from "@/components/venues/venue-card";
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

async function getVenues(type?: string): Promise<VenueListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_venues_for_discovery", {
    p_type: type || null,
    p_open_now: false,
    p_limit: 50,
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
        <div
          key={i}
          className="rounded-lg border bg-card animate-pulse"
        >
          <div className="aspect-[2/1] bg-muted" />
          <div className="p-4 space-y-3">
            <div className="flex gap-3">
              <div className="w-12 h-12 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
            <div className="h-3 bg-muted rounded w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function VenuesGrid({ type }: { type?: string }) {
  const venues = await getVenues(type);
  const locale = await getLocale();
  const t = await getTranslations("venues");

  if (venues.length === 0) {
    return (
      <div className="text-center py-16">
        <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">
          {type ? `No ${type} venues found` : "No venues found"}
        </p>
      </div>
    );
  }

  // Separate venues with happening now
  const happeningNow = venues.filter((v) => v.has_happening_now);
  const otherVenues = venues.filter((v) => !v.has_happening_now);

  return (
    <div className="space-y-8">
      {/* Happening Now Section */}
      {happeningNow.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
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
  );
}

export default async function VenuesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { type } = await searchParams;
  const t = await getTranslations("venues");
  const tCommon = await getTranslations("common");

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
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
          <Link
            href="/"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>
        </div>
      </nav>

      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* Page title */}
        <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

        {/* Type filter */}
        <div className="mb-6">
          <VenueTypeFilter selectedType={selectedType} />
        </div>

        {/* Venues grid */}
        <Suspense fallback={<VenuesLoading />}>
          <VenuesGrid type={selectedType || undefined} />
        </Suspense>
      </div>
    </main>
  );
}
