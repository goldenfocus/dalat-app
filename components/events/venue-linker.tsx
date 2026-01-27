"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin, Link2, Unlink, Search, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import type { VenueType } from "@/lib/types";

interface VenueResult {
  id: string;
  name: string;
  venueType: VenueType | null;
  address: string | null;
  latitude: number;
  longitude: number;
  googleMapsUrl: string | null;
  isVerified: boolean;
}

interface VenueLinkerProps {
  /** Current venue ID if already linked */
  venueId: string | null;
  /** Current venue name (for display when linked) */
  venueName?: string | null;
  /** Event coordinates for auto-suggest */
  latitude: number | null;
  longitude: number | null;
  /** Callback when venue is linked/unlinked */
  onVenueChange: (venue: VenueResult | null) => void;
  /** Whether the form is disabled */
  disabled?: boolean;
}

export function VenueLinker({
  venueId,
  venueName,
  latitude,
  longitude,
  onVenueChange,
  disabled = false,
}: VenueLinkerProps) {
  const t = useTranslations("eventForm");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VenueResult[]>([]);
  const [nearbyVenues, setNearbyVenues] = useState<VenueResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);

  // Fetch nearby venues when coordinates are available and no venue is linked
  useEffect(() => {
    if (venueId || !latitude || !longitude) {
      setNearbyVenues([]);
      return;
    }

    async function fetchNearbyVenues() {
      setIsLoadingNearby(true);
      try {
        const response = await fetch(
          `/api/venues/search?lat=${latitude}&lng=${longitude}&radius=150`
        );
        const data = await response.json();
        setNearbyVenues(data.venues || []);
      } catch (error) {
        console.error("Failed to fetch nearby venues:", error);
        setNearbyVenues([]);
      } finally {
        setIsLoadingNearby(false);
      }
    }

    fetchNearbyVenues();
  }, [venueId, latitude, longitude]);

  // Search venues by query
  const searchVenues = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/venues/search?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      setSearchResults(data.venues || []);
    } catch (error) {
      console.error("Venue search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchVenues(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchVenues]);

  // Fetch popular venues when dialog opens with no search
  const fetchPopularVenues = useCallback(async () => {
    if (searchQuery) return;

    setIsSearching(true);
    try {
      const response = await fetch("/api/venues/search?popular=true");
      const data = await response.json();
      setSearchResults(data.venues || []);
    } catch (error) {
      console.error("Failed to fetch popular venues:", error);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleDialogOpen = (open: boolean) => {
    setIsDialogOpen(open);
    if (open) {
      setSearchQuery("");
      fetchPopularVenues();
    }
  };

  const handleSelectVenue = (venue: VenueResult) => {
    onVenueChange(venue);
    setIsDialogOpen(false);
  };

  const handleUnlink = () => {
    onVenueChange(null);
  };

  const renderVenueItem = (venue: VenueResult, onClick: () => void) => {
    const typeConfig = getVenueTypeConfig(venue.venueType);
    const TypeIcon = typeConfig.icon;

    return (
      <button
        key={venue.id}
        type="button"
        onClick={onClick}
        className="w-full px-3 py-2.5 text-left hover:bg-muted active:bg-muted active:scale-[0.99] transition-all flex items-start gap-2 rounded-md"
      >
        <div
          className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${typeConfig.bgColor} ${typeConfig.darkBgColor}`}
        >
          <TypeIcon
            className={`w-3.5 h-3.5 ${typeConfig.color} ${typeConfig.darkColor}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm flex items-center gap-1">
            {venue.name}
            {venue.isVerified && (
              <Check className="w-3 h-3 text-green-500" />
            )}
          </p>
          {venue.address && (
            <p className="text-xs text-muted-foreground truncate">
              {venue.address}
            </p>
          )}
        </div>
      </button>
    );
  };

  // If venue is already linked, show the linked state
  if (venueId) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
        <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium flex items-center gap-1">
            <Link2 className="w-3 h-3 text-green-500" />
            {t("venueLinked")}
          </p>
          {venueName && (
            <p className="text-xs text-muted-foreground truncate">{venueName}</p>
          )}
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleUnlink}
            className="text-muted-foreground hover:text-destructive"
          >
            <Unlink className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  }

  // Show auto-suggestions for nearby venues
  const hasNearbyVenues = nearbyVenues.length > 0;

  return (
    <div className="space-y-2">
      {/* Auto-suggest nearby venues */}
      {isLoadingNearby && (
        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("venueFindingNearby")}
        </div>
      )}

      {hasNearbyVenues && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
            {t("venueNearbyFound")}
          </p>
          <div className="space-y-1">
            {nearbyVenues.map((venue) =>
              renderVenueItem(venue, () => onVenueChange(venue))
            )}
          </div>
        </div>
      )}

      {/* Manual link button */}
      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="w-full"
          >
            <Link2 className="w-4 h-4 mr-2" />
            {t("venueLinkButton")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("venueLinkDialogTitle")}</DialogTitle>
          </DialogHeader>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("venueSearchPlaceholder")}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Search results */}
          <div className="max-h-64 overflow-auto">
            {isSearching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.map((venue) =>
                  renderVenueItem(venue, () => handleSelectVenue(venue))
                )}
              </div>
            ) : searchQuery.length >= 2 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">
                {t("venueNoResults")}
              </p>
            ) : (
              <p className="text-center py-8 text-sm text-muted-foreground">
                {t("venueSearchHint")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
