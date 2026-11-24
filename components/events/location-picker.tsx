"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2, X, Check, Navigation, PenLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { getVenueTypeConfig } from "@/lib/constants/venue-types";
import type { VenueType } from "@/lib/types";
import {
  parseLocationInput,
  isGoogleMapsUrl,
  isShortGoogleMapsUrl,
  generateGoogleMapsUrl,
  formatCoordinates,
  type ParsedCoordinates,
} from "@/lib/geo/parse-location";
import {
  buildLocationFieldValues,
  googleMapsSearchUrl,
  isCustomLocationCandidate,
  makeCustomLocation,
} from "@/lib/geo/location-form-values";

// Venue result from our API
interface VenueResult {
  id: string;
  name: string;
  venueType: VenueType | null;
  address: string | null;
  latitude: number;
  longitude: number;
  googleMapsUrl: string | null;
  isVerified: boolean;
  isPublicMapPlace?: boolean;
}

// Selected location data (venue, Google Place, or free-form address)
export interface SelectedLocation {
  type: "venue" | "place" | "custom";
  venueId?: string;
  placeId?: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
}

interface LocationPickerProps {
  onLocationSelect?: (location: SelectedLocation | null) => void;
  onVenueIdChange?: (venueId: string | null) => void;
  defaultValue?: SelectedLocation | null;
  defaultVenueId?: string | null;
  addressAssistEnabled?: boolean;
}

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

export function LocationPicker({
  onLocationSelect,
  onVenueIdChange,
  defaultValue,
  defaultVenueId,
  addressAssistEnabled = true,
}: LocationPickerProps) {
  const t = useTranslations("eventForm");

  const [query, setQuery] = useState(defaultValue?.name || "");
  const [venues, setVenues] = useState<VenueResult[]>([]);
  const [placeSuggestions, setPlaceSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingVenues, setIsLoadingVenues] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(defaultValue || null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(
    defaultVenueId || defaultValue?.venueId || null
  );
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [isLoadingScript, setIsLoadingScript] = useState(false);

  // True when a search backend failed — the typed text still saves as a custom address
  const [searchDegraded, setSearchDegraded] = useState(false);

  const [addressAssist, setAddressAssist] = useState<"idle" | "pending" | "done">("idle");

  // Smart detection state for coordinates/URLs
  const [detectedCoords, setDetectedCoords] = useState<ParsedCoordinates | null>(null);
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [urlResolveError, setUrlResolveError] = useState<string | null>(null);

  const sessionToken =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const searchSeq = useRef(0);
  const assistRequest = useRef<AbortController | null>(null);
  const [completedSearch, setCompletedSearch] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  // Load Google Maps script lazily
  const loadGoogleMaps = useCallback(() => {
    if (scriptLoadedRef.current || isGoogleReady) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key not found");
      return;
    }

    if (typeof google !== "undefined" && google.maps?.places) {
      sessionToken.current = new google.maps.places.AutocompleteSessionToken();
      setIsGoogleReady(true);
      scriptLoadedRef.current = true;
      return;
    }

    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    );
    if (existingScript) {
      const checkReady = setInterval(() => {
        if (typeof google !== "undefined" && google.maps?.places) {
          clearInterval(checkReady);
          sessionToken.current =
            new google.maps.places.AutocompleteSessionToken();
          setIsGoogleReady(true);
          scriptLoadedRef.current = true;
        }
      }, 100);
      setTimeout(() => clearInterval(checkReady), 5000);
      return;
    }

    setIsLoadingScript(true);
    scriptLoadedRef.current = true;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&loading=async`;
    script.async = true;
    script.defer = true;

    const releaseLoader = setTimeout(() => setIsLoadingScript(false), 5000);
    script.onerror = () => {
      clearTimeout(releaseLoader);
      setIsLoadingScript(false);
      setSearchDegraded(true);
    };
    script.onload = () => {
      const checkReady = setInterval(() => {
        if (typeof google !== "undefined" && google.maps?.places) {
          clearInterval(checkReady);
          sessionToken.current =
            new google.maps.places.AutocompleteSessionToken();
          setIsGoogleReady(true);
          clearTimeout(releaseLoader);
          setIsLoadingScript(false);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkReady);
        setIsLoadingScript(false);
      }, 5000);
    };

    document.head.appendChild(script);
  }, [isGoogleReady]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      assistRequest.current?.abort();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch popular venues on initial focus
  const fetchPopularVenues = useCallback(async () => {
    setIsLoadingVenues(true);
    try {
      const response = await fetch("/api/venues/search?popular=true");
      const data = await response.json();
      setVenues(data.venues || []);
      if (data.venues?.length > 0) {
        setIsOpen(true);
      }
    } catch (error) {
      console.error("Failed to fetch popular venues:", error);
    } finally {
      setIsLoadingVenues(false);
    }
  }, []);

  // Search venues by query
  const searchVenues = useCallback(async (searchQuery: string, seq: number) => {
    if (searchQuery.length < MIN_CHARS) {
      setVenues([]);
      return;
    }

    setIsLoadingVenues(true);
    try {
      const response = await fetch(
        `/api/venues/search?q=${encodeURIComponent(searchQuery)}${addressAssistEnabled ? "&publicPlaces=true" : ""}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error("Venue search failed");
      if (seq === searchSeq.current) setVenues(data.venues || []);
    } catch (error) {
      console.error("Venue search error:", error);
      if (seq === searchSeq.current) {
        setVenues([]);
        setSearchDegraded(true);
      }
    } finally {
      setIsLoadingVenues(false);
    }
  }, [addressAssistEnabled]);

  // Resolve short Google Maps URL via API
  const resolveShortUrl = useCallback(async (url: string) => {
    setIsResolvingUrl(true);
    setUrlResolveError(null);

    try {
      const response = await fetch("/api/resolve-maps-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setUrlResolveError(data.error || "Failed to resolve URL");
        return null;
      }

      return {
        latitude: data.latitude,
        longitude: data.longitude,
        source: "short-url" as const,
      };
    } catch (error) {
      console.error("Error resolving short URL:", error);
      setUrlResolveError("Failed to resolve URL");
      return null;
    } finally {
      setIsResolvingUrl(false);
    }
  }, []);

  // Reverse geocode to get place name from coordinates
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const response = await fetch("/api/reverse-geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      return data.name ? { name: data.name, address: data.address } : null;
    } catch (error) {
      console.error("Reverse geocode error:", error);
      return null;
    }
  }, []);

  // Apply detected coordinates as the selected location
  const applyDetectedCoordinates = useCallback(
    async (coords: ParsedCoordinates, _rawInput: string) => {
      const formattedCoords = formatCoordinates(coords.latitude, coords.longitude);

      // Set location immediately with coordinates (quick feedback)
      const initialLocation: SelectedLocation = {
        type: "place",
        name: formattedCoords,
        address: formattedCoords,
        latitude: coords.latitude,
        longitude: coords.longitude,
        googleMapsUrl: generateGoogleMapsUrl(coords.latitude, coords.longitude),
      };

      setSelectedLocation(initialLocation);
      setSelectedVenueId(null);
      setDetectedCoords(coords);
      setIsOpen(false);
      onLocationSelect?.(initialLocation);
      onVenueIdChange?.(null);

      // Then reverse geocode to get the actual place name (async)
      setIsReverseGeocoding(true);
      const placeInfo = await reverseGeocode(coords.latitude, coords.longitude);
      setIsReverseGeocoding(false);

      if (placeInfo?.name) {
        // Update with the real place name
        const enrichedLocation: SelectedLocation = {
          type: "place",
          name: placeInfo.name,
          address: placeInfo.address || formattedCoords,
          latitude: coords.latitude,
          longitude: coords.longitude,
          googleMapsUrl: generateGoogleMapsUrl(coords.latitude, coords.longitude),
        };

        setSelectedLocation(enrichedLocation);
        setQuery(placeInfo.name); // Update the input to show the place name
        onLocationSelect?.(enrichedLocation);
      }
    },
    [onLocationSelect, onVenueIdChange, reverseGeocode]
  );

  // Detect and handle coordinate/URL input
  const handleSmartDetection = useCallback(
    async (value: string) => {
      // Reset detection state
      setDetectedCoords(null);
      setUrlResolveError(null);

      // Check for direct coordinates first
      const parsed = parseLocationInput(value);
      if (parsed) {
        applyDetectedCoordinates(parsed, value);
        return true;
      }

      // Check for short Google Maps URLs (need API resolution)
      if (isShortGoogleMapsUrl(value)) {
        const resolved = await resolveShortUrl(value);
        if (resolved) {
          applyDetectedCoordinates(resolved, value);
          return true;
        }
        // If resolution failed, let user continue typing or clear
        return false;
      }

      // Check for full Google Maps URLs that parseLocationInput didn't catch
      if (isGoogleMapsUrl(value) && !parsed) {
        // URL format not recognized - could be a place URL without coords
        // Fall through to normal search
        return false;
      }

      return false;
    },
    [applyDetectedCoordinates, resolveShortUrl]
  );

  // Search Google Places
  const searchPlaces = useCallback(
    async (searchQuery: string, seq: number) => {
      if (!isGoogleReady || searchQuery.length < MIN_CHARS) {
        setPlaceSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const request: google.maps.places.AutocompleteRequest = {
          input: searchQuery,
          sessionToken: sessionToken.current!,
          includedRegionCodes: ["vn"],
          locationBias: { center: { lat: 11.9404, lng: 108.4583 }, radius: 30000 },
        };

        const { suggestions } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
            request
          );
        if (seq === searchSeq.current) setPlaceSuggestions(suggestions || []);
      } catch (error) {
        console.error("Places search error:", error);
        if (seq === searchSeq.current) {
          setPlaceSuggestions([]);
          setSearchDegraded(true);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isGoogleReady]
  );

  useEffect(() => {
    const input = inputRef.current;
    const typedAddress = input?.value.trim() || "";
    if (isGoogleReady && document.activeElement === input && isCustomLocationCandidate(typedAddress)) {
      void searchPlaces(typedAddress, searchSeq.current);
    }
  }, [isGoogleReady, searchPlaces]);

  const updateQuery = (value: string) => {
    assistRequest.current?.abort();
    setAddressAssist("idle");
    setCompletedSearch(null);
    setQuery(value);
    const seq = ++searchSeq.current;

    // Clearing the previous selection also clears its hidden coordinates.
    if (selectedLocation) {
      setSelectedLocation(null);
      setSelectedVenueId(null);
      onLocationSelect?.(null);
      onVenueIdChange?.(null);
    }

    // Reset detection state when typing
    setDetectedCoords(null);
    setUrlResolveError(null);

    // Debounce the search
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (value.length >= MIN_CHARS) {
      debounceTimer.current = setTimeout(async () => {
        setSearchDegraded(false);
        // Try smart detection first (coordinates or URLs)
        const detected = await handleSmartDetection(value);
        if (seq !== searchSeq.current) return;
        if (detected) {
          // Coordinates/URL detected and applied - don't search
          setVenues([]);
          setPlaceSuggestions([]);
          return;
        }

        // Not coordinates/URL - proceed with normal search
        setIsOpen(true);
        await Promise.all([searchVenues(value, seq), searchPlaces(value, seq)]);
        if (seq === searchSeq.current) setCompletedSearch(value);
      }, DEBOUNCE_MS);
    } else if (value.length === 0) {
      // Show popular venues when cleared
      fetchPopularVenues();
      setPlaceSuggestions([]);
      setDetectedCoords(null);
    } else {
      setVenues([]);
      setPlaceSuggestions([]);
      setIsOpen(false);
    }
  };

  const handleFocus = () => {
    loadGoogleMaps();
    if (
      venues.length > 0 ||
      placeSuggestions.length > 0 ||
      (isCustomLocationCandidate(query) && !detectedCoords)
    ) {
      setIsOpen(true);
    } else if (!query && !selectedLocation) {
      // Fetch popular venues on first focus when empty
      fetchPopularVenues();
    }
  };

  const handleSelectVenue = (venue: VenueResult) => {
    const location: SelectedLocation = {
      type: venue.isPublicMapPlace ? "place" : "venue",
      venueId: venue.isPublicMapPlace ? undefined : venue.id,
      name: venue.name,
      address: venue.address || (venue.isPublicMapPlace ? "Đà Lạt, Lâm Đồng" : ""),
      latitude: venue.latitude,
      longitude: venue.longitude,
      googleMapsUrl:
        venue.googleMapsUrl ||
        googleMapsSearchUrl(`${venue.latitude},${venue.longitude}`),
    };

    assistRequest.current?.abort();
    searchSeq.current++;
    setQuery(venue.name);
    setSelectedLocation(location);
    setSelectedVenueId(location.venueId ?? null);
    setIsOpen(false);
    onLocationSelect?.(location);
    onVenueIdChange?.(location.venueId ?? null);
  };

  const handleSelectPlace = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;

    assistRequest.current?.abort();
    const seq = ++searchSeq.current;
    setIsLoading(true);
    setIsOpen(false);

    try {
      const place = new google.maps.places.Place({
        id: suggestion.placePrediction.placeId,
      });

      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "googleMapsURI", "location"],
      });

      if (seq !== searchSeq.current) return;
      sessionToken.current = new google.maps.places.AutocompleteSessionToken();

      const location: SelectedLocation = {
        type: "place",
        placeId: suggestion.placePrediction.placeId,
        name:
          place.displayName ||
          suggestion.placePrediction.mainText?.text ||
          "",
        address:
          place.formattedAddress || suggestion.placePrediction.text?.text || "",
        googleMapsUrl:
          place.googleMapsURI ||
          `https://www.google.com/maps/place/?q=place_id:${suggestion.placePrediction.placeId}`,
        latitude: place.location?.lat() ?? null,
        longitude: place.location?.lng() ?? null,
      };

      setQuery(location.name);
      setSelectedLocation(location);
      setSelectedVenueId(null);
      onLocationSelect?.(location);
      onVenueIdChange?.(null);
    } catch (error) {
      console.error("Place details error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCustom = () => {
    if (!isCustomLocationCandidate(query)) return;

    const location: SelectedLocation = {
      type: "custom",
      ...makeCustomLocation(query),
    };

    assistRequest.current?.abort();
    searchSeq.current++;
    setQuery(location.name);
    setSelectedLocation(location);
    setSelectedVenueId(null);
    setIsOpen(false);
    onLocationSelect?.(location);
    onVenueIdChange?.(null);
  };

  const handleClear = () => {
    assistRequest.current?.abort();
    searchSeq.current++;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setQuery("");
    setSelectedLocation(null);
    setSelectedVenueId(null);
    setVenues([]);
    setPlaceSuggestions([]);
    setDetectedCoords(null);
    setUrlResolveError(null);
    setSearchDegraded(false);
    setAddressAssist("idle");
    onLocationSelect?.(null);
    onVenueIdChange?.(null);
    inputRef.current?.focus();
  };

  const visibleVenues = addressAssistEnabled ? venues : venues.filter((venue) => !venue.isPublicMapPlace);
  const hasResults = visibleVenues.length > 0 || placeSuggestions.length > 0;
  const showLoading = isLoading || isLoadingVenues || isLoadingScript || isResolvingUrl;
  const customText = query.trim();
  const canOfferCustom = isCustomLocationCandidate(query) && !detectedCoords;
  const locationFields = buildLocationFieldValues(selectedLocation, query);

  useEffect(() => {
    if (!addressAssistEnabled) {
      assistRequest.current?.abort();
      setAddressAssist("idle");
    }
  }, [addressAssistEnabled]);

  useEffect(() => {
    if (
      !addressAssistEnabled || !isOpen || selectedLocation || hasResults || showLoading ||
      !canOfferCustom || completedSearch !== query || customText.length < 5 || customText.length > 160 ||
      addressAssist !== "idle"
    ) return;

    const seq = searchSeq.current;
    const timer = setTimeout(async () => {
      if (seq !== searchSeq.current) return;
      const controller = new AbortController();
      assistRequest.current = controller;
      setAddressAssist("pending");
      try {
        const response = await fetch("/api/events/address-assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: customText }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Address assistant unavailable");
        const { suggestion } = await response.json() as { suggestion: string | null };
        if (seq !== searchSeq.current || controller.signal.aborted) return;
        if (suggestion) await Promise.all([searchVenues(suggestion, seq), searchPlaces(suggestion, seq)]);
      } catch {
        // The address as typed stays available if the assistant is unavailable.
      } finally {
        if (seq === searchSeq.current && !controller.signal.aborted) setAddressAssist("done");
      }
    }, 850);
    return () => clearTimeout(timer);
  }, [addressAssist, addressAssistEnabled, canOfferCustom, completedSearch, customText, hasResults, isOpen, query, searchPlaces, searchVenues, selectedLocation, showLoading]);


  return (
    <div ref={containerRef} className="relative space-y-2">
      <Label htmlFor="location">{t("location")}</Label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          id="location"
          type="text"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onFocus={handleFocus}
          placeholder={
            isLoadingScript
              ? t("locationLoading") || "Loading..."
              : isResolvingUrl
                ? t("locationResolvingUrl") || "Extracting location..."
                : t("locationPlaceholder") || "Search venues, paste coordinates or Google Maps link..."
          }
          className="pl-9 pr-9"
          autoComplete="off"
        />
        {showLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
        {!showLoading && query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Selected location info */}
      {selectedLocation && (
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          {(selectedLocation.type === "venue" ||
            selectedLocation.type === "custom") && (
            <Check className="w-3 h-3 text-green-500" />
          )}
          {detectedCoords && !isReverseGeocoding && (
            <Navigation className="w-3 h-3 text-blue-500" />
          )}
          {isReverseGeocoding && (
            <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
          )}
          {detectedCoords ? (
            <span>
              {isReverseGeocoding
                ? (t("locationLookingUp") || "Looking up location...")
                : selectedLocation.name}
            </span>
          ) : (
            selectedLocation.address
          )}
        </p>
      )}

      {/* URL resolution error */}
      {urlResolveError && (
        <p className="text-sm text-amber-600 flex items-center gap-1">
          {t("locationUrlError") || "Could not extract location from URL. Try pasting coordinates directly."}
        </p>
      )}

      {/* Resolving URL indicator */}
      {isResolvingUrl && (
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t("locationResolvingUrl") || "Extracting location from link..."}
        </p>
      )}

      {/* Dropdown */}
      {isOpen && (hasResults || canOfferCustom) && (
        <ul className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-72 overflow-auto">
          {/* Venues section */}
          {visibleVenues.length > 0 && (
            <>
              <li className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">
                {t("locationVenuesSection") || "Venues"}
              </li>
              {visibleVenues.map((venue) => {
                const typeConfig = getVenueTypeConfig(venue.venueType);
                const TypeIcon = typeConfig.icon;

                return (
                  <li key={venue.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectVenue(venue)}
                      className="w-full px-3 py-2 text-left hover:bg-muted active:bg-muted active:scale-[0.99] transition-all flex items-start gap-2"
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
                  </li>
                );
              })}
              {visibleVenues.some((venue) => venue.isPublicMapPlace) && addressAssistEnabled && (
                <li className="px-3 py-1 text-xs text-muted-foreground">
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                    © OpenStreetMap contributors
                  </a>
                </li>
              )}
            </>
          )}

          {/* Separator */}
          {visibleVenues.length > 0 && placeSuggestions.length > 0 && (
            <li className="border-t my-1" />
          )}

          {/* Google Places section */}
          {placeSuggestions.length > 0 && (
            <>
              <li className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/50">
                {t("locationPlacesSection") || "Other Locations"}
              </li>
              {placeSuggestions.map((suggestion) => {
                const prediction = suggestion.placePrediction;
                if (!prediction) return null;

                return (
                  <li key={prediction.placeId}>
                    <button
                      type="button"
                      onClick={() => handleSelectPlace(suggestion)}
                      className="w-full px-3 py-2 text-left hover:bg-muted active:bg-muted active:scale-[0.99] transition-all flex items-start gap-2"
                    >
                      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 bg-gray-100 dark:bg-gray-800">
                        <MapPin className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">
                          {prediction.mainText?.text}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {prediction.secondaryText?.text}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </>
          )}

          {/* Search backend down — be honest instead of "no results" */}
          {!hasResults && searchDegraded && !showLoading && (
            <li className="px-3 py-2 text-sm text-amber-600">
              {t("locationSearchUnavailable")}
            </li>
          )}

          {/* Genuinely no matches */}
          {!hasResults && !searchDegraded && !showLoading && !canOfferCustom && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t("locationNoResults")}
            </li>
          )}

          {addressAssistEnabled && canOfferCustom && !hasResults && addressAssist === "pending" && (
            <li role="status" className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("locationLookingUp")}
            </li>
          )}

          {/* Free-form fallback — never a dead end */}
          {canOfferCustom && (
            <li className={hasResults ? "border-t" : ""}>
              <button
                type="button"
                onClick={handleSelectCustom}
                className="w-full px-3 py-2 text-left hover:bg-muted active:bg-muted active:scale-[0.99] transition-all flex items-start gap-2"
              >
                <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 bg-gray-100 dark:bg-gray-800">
                  <PenLine className="w-3.5 h-3.5 text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">
                    {t("locationUseAsTyped")}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    {customText}
                  </p>
                </div>
              </button>
            </li>
          )}
        </ul>
      )}

      {/* Hidden inputs for form submission */}
      <input
        type="hidden"
        name="venue_id"
        value={selectedVenueId || ""}
      />
      <input
        type="hidden"
        name="location_name"
        value={locationFields.location_name}
      />
      <input type="hidden" name="address" value={locationFields.address} />
      <input
        type="hidden"
        name="google_maps_url"
        value={locationFields.google_maps_url}
      />
      <input type="hidden" name="latitude" value={locationFields.latitude} />
      <input type="hidden" name="longitude" value={locationFields.longitude} />
    </div>
  );
}
