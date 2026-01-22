"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Place {
  placeId: string;
  name: string;
  address: string;
  googleMapsUrl: string;
  latitude: number | null;
  longitude: number | null;
}

interface PlaceAutocompleteProps {
  onPlaceSelect: (place: Place | null) => void;
  defaultValue?: Place | null;
}

// Cost safeguards:
// 1. Debounce: 300ms delay before searching
// 2. Min chars: Only search after 3+ characters
// 3. Session tokens: Bundle autocomplete + details into one billing session
// 4. Restrict to Vietnam: Fewer results
// 5. Limit fields: Only request what we need
// 6. Lazy load: Only load Google Maps when user focuses input

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

export function PlaceAutocomplete({ onPlaceSelect, defaultValue }: PlaceAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue?.name || "");
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(defaultValue || null);
  const [isReady, setIsReady] = useState(false);
  const [isLoadingScript, setIsLoadingScript] = useState(false);

  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  // Load Google Maps script lazily (only when needed)
  const loadGoogleMaps = useCallback(() => {
    if (scriptLoadedRef.current || isReady) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key not found");
      return;
    }

    // Check if already loaded
    if (typeof google !== "undefined" && google.maps?.places) {
      sessionToken.current = new google.maps.places.AutocompleteSessionToken();
      setIsReady(true);
      scriptLoadedRef.current = true;
      return;
    }

    // Check if script is already in DOM
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Wait for it to load
      const checkReady = setInterval(() => {
        if (typeof google !== "undefined" && google.maps?.places) {
          clearInterval(checkReady);
          sessionToken.current = new google.maps.places.AutocompleteSessionToken();
          setIsReady(true);
          scriptLoadedRef.current = true;
        }
      }, 100);
      setTimeout(() => clearInterval(checkReady), 5000);
      return;
    }

    setIsLoadingScript(true);
    scriptLoadedRef.current = true;

    // Load script asynchronously with both places and marker libraries
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&loading=async`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      // Wait for google.maps.places to be available
      const checkReady = setInterval(() => {
        if (typeof google !== "undefined" && google.maps?.places) {
          clearInterval(checkReady);
          sessionToken.current = new google.maps.places.AutocompleteSessionToken();
          setIsReady(true);
          setIsLoadingScript(false);
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkReady);
        setIsLoadingScript(false);
      }, 5000);
    };

    document.head.appendChild(script);
  }, [isReady]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchPlaces = useCallback(async (searchQuery: string) => {
    if (!isReady || searchQuery.length < MIN_CHARS) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);

    try {
      // Use new AutocompleteSuggestion API
      const request: google.maps.places.AutocompleteRequest = {
        input: searchQuery,
        sessionToken: sessionToken.current!,
        includedRegionCodes: ["vn"], // Restrict to Vietnam
        includedPrimaryTypes: ["establishment", "geocode"],
      };

      const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

      setSuggestions(suggestions || []);
      setIsOpen(suggestions && suggestions.length > 0);
    } catch (error) {
      console.error("Places search error:", error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [isReady]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Clear selection when typing
    if (selectedPlace) {
      setSelectedPlace(null);
      onPlaceSelect(null);
    }

    // Debounce the search
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (value.length >= MIN_CHARS) {
      debounceTimer.current = setTimeout(() => {
        searchPlaces(value);
      }, DEBOUNCE_MS);
    } else {
      setSuggestions([]);
      setIsOpen(false);
    }
  };

  const handleSelectPlace = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!suggestion.placePrediction) return;

    setIsLoading(true);
    setIsOpen(false);

    try {
      // Use new Place API to get details including location
      const place = new google.maps.places.Place({
        id: suggestion.placePrediction.placeId,
      });

      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "googleMapsURI", "location"],
      });

      // Create new session token for next search
      sessionToken.current = new google.maps.places.AutocompleteSessionToken();

      const selectedPlaceData: Place = {
        placeId: suggestion.placePrediction.placeId,
        name: place.displayName || suggestion.placePrediction.mainText?.text || "",
        address: place.formattedAddress || suggestion.placePrediction.text?.text || "",
        googleMapsUrl: place.googleMapsURI || `https://www.google.com/maps/place/?q=place_id:${suggestion.placePrediction.placeId}`,
        latitude: place.location?.lat() ?? null,
        longitude: place.location?.lng() ?? null,
      };

      setQuery(selectedPlaceData.name);
      setSelectedPlace(selectedPlaceData);
      onPlaceSelect(selectedPlaceData);
    } catch (error) {
      console.error("Place details error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setSelectedPlace(null);
    setSuggestions([]);
    onPlaceSelect(null);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative space-y-2">
      <Label htmlFor="place">Location *</Label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          id="place"
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            loadGoogleMaps(); // Lazy load on first focus
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={isLoadingScript ? "Loading..." : "Search for a place in Vietnam..."}
          className="pl-9 pr-9"
          autoComplete="off"
        />
        {(isLoading || isLoadingScript) && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
        {!isLoading && !isLoadingScript && query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Selected place info */}
      {selectedPlace && (
        <p className="text-sm text-muted-foreground">{selectedPlace.address}</p>
      )}

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion) => {
            const prediction = suggestion.placePrediction;
            if (!prediction) return null;

            return (
              <li key={prediction.placeId}>
                <button
                  type="button"
                  onClick={() => handleSelectPlace(suggestion)}
                  className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                >
                  <p className="font-medium text-sm">
                    {prediction.mainText?.text}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {prediction.secondaryText?.text}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Hidden inputs for form submission */}
      <input type="hidden" name="location_name" value={selectedPlace?.name || ""} />
      <input type="hidden" name="address" value={selectedPlace?.address || ""} />
      <input type="hidden" name="google_maps_url" value={selectedPlace?.googleMapsUrl || ""} />
      <input type="hidden" name="latitude" value={selectedPlace?.latitude ?? ""} />
      <input type="hidden" name="longitude" value={selectedPlace?.longitude ?? ""} />
    </div>
  );
}
