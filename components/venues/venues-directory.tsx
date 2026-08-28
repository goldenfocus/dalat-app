"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, Search, X } from "lucide-react";
import { VenueCard } from "@/components/venues/venue-card";
import { VenueTypeFilter } from "@/components/venues/venue-type-filter";
import { venueMatchesSearch } from "@/lib/venues/search";
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
  typeCounts: Record<VenueType, number>;
}

export function VenuesDirectory({ venues, typeCounts }: VenuesDirectoryProps) {
  const t = useTranslations("venues");
  const homeT = useTranslations("home");
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");

  // Validate type parameter from URL (client-side so the page stays static)
  const type = searchParams?.get("type");
  const selectedType = type && VALID_TYPES.includes(type) ? (type as VenueType) : null;

  // Filter by type and canonical venue data. Names are never machine-translated.
  const typeFilteredVenues = selectedType
    ? venues.filter((v) => v.venue_type === selectedType)
    : venues;
  const filteredVenues = typeFilteredVenues.filter((venue) =>
    venueMatchesSearch(venue, query)
  );
  const hasQuery = query.trim().length > 0;

  // Separate venues with happening now
  const happeningNow = filteredVenues.filter((v) => v.has_happening_now);
  const otherVenues = filteredVenues.filter((v) => !v.has_happening_now);

  return (
    <>
      <div className="relative mb-4">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={homeT("search.clearSearch")}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {hasQuery && (
        <p className="sr-only" role="status" aria-live="polite">
          {t("searchResults", { count: filteredVenues.length })}
        </p>
      )}

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
            {hasQuery ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-primary hover:underline"
              >
                {homeT("search.clearSearch")}
              </button>
            ) : (
              t("noVenuesDescription")
            )}
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
