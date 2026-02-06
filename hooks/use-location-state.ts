"use client";

import { useState, useCallback } from "react";
import type { SelectedLocation } from "@/components/events/location-picker";

interface UseLocationStateOptions {
  initialVenueId?: string | null;
  initialVenueName?: string | null;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
}

interface UseLocationStateReturn {
  venueId: string | null;
  venueName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  /** Handle location selection from LocationPicker */
  handleLocationSelect: (location: SelectedLocation | null) => void;
  /** Handle venue linking from VenueLinker */
  handleVenueLink: (venue: { id: string; name: string; latitude: number; longitude: number } | null) => void;
  /** Clear venue (but keep coordinates) */
  clearVenue: () => void;
}

/**
 * Hook to manage location and venue state.
 * Coordinates the interaction between LocationPicker and VenueLinker components.
 */
export function useLocationState({
  initialVenueId = null,
  initialVenueName = null,
  initialLatitude = null,
  initialLongitude = null,
}: UseLocationStateOptions = {}): UseLocationStateReturn {
  const [venueId, setVenueId] = useState<string | null>(initialVenueId);
  const [venueName, setVenueName] = useState<string | null>(initialVenueName);
  const [locationLat, setLocationLat] = useState<number | null>(initialLatitude);
  const [locationLng, setLocationLng] = useState<number | null>(initialLongitude);

  const handleLocationSelect = useCallback((location: SelectedLocation | null) => {
    if (location) {
      setLocationLat(location.latitude);
      setLocationLng(location.longitude);
      if (location.type === "venue" && location.venueId) {
        setVenueId(location.venueId);
        setVenueName(location.name);
      } else {
        // Google Place selected - clear venue link
        setVenueId(null);
        setVenueName(null);
      }
    } else {
      setLocationLat(null);
      setLocationLng(null);
      setVenueId(null);
      setVenueName(null);
    }
  }, []);

  const handleVenueLink = useCallback((venue: { id: string; name: string; latitude: number; longitude: number } | null) => {
    if (venue) {
      setVenueId(venue.id);
      setVenueName(venue.name);
      // Optionally update coordinates to match venue
      setLocationLat(venue.latitude);
      setLocationLng(venue.longitude);
    } else {
      setVenueId(null);
      setVenueName(null);
    }
  }, []);

  const clearVenue = useCallback(() => {
    setVenueId(null);
    setVenueName(null);
  }, []);

  return {
    venueId,
    venueName,
    locationLat,
    locationLng,
    handleLocationSelect,
    handleVenueLink,
    clearVenue,
  };
}
