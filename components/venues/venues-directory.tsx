"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2 } from "lucide-react";
import { VenueCard } from "@/components/venues/venue-card";
import { VenueTypeFilter } from "@/components/venues/venue-type-filter";
import type { VenueListItem, VenueType } from "@/lib/types";

const VALID_TYPES = [
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

interface VenuesDirectoryProps {
  venues: VenueListItem[];
  translatedNames: Record<string, string>;
  typeCounts: Record<VenueType, number>;
}

export function VenuesDirectory({ venues, translatedNames, typeCounts }: VenuesDirectoryProps) {
  const t = useTranslations("venues");
  const searchParams = useSearchParams();

  // Validate type parameter from URL (client-side so the page stays static)
  const type = searchParams?.get("type");
  const selectedType = type && VALID_TYPES.includes(type) ? (type as VenueType) : null;

  // Filter venues by selected type
  const filteredVenues = selectedType
    ? venues.filter((v) => v.venue_type === selectedType)
    : venues;

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
                  <VenueCard
                    key={venue.id}
                    venue={venue}
                    translatedName={translatedNames[venue.id]}
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
                  translatedName={translatedNames[venue.id]}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
