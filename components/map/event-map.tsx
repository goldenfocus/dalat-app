"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { Loader2, Navigation, X } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import type { Event } from "@/lib/types";
import type { EventTag } from "@/lib/constants/event-tags";
import { DALAT_CENTER, DEFAULT_ZOOM, MARKER_COLORS } from "./map-styles";
import { TagFilterBar } from "@/components/events/tag-filter-bar";
import { formatInDaLat } from "@/lib/timezone";
import { triggerHaptic } from "@/lib/haptics";

interface EventMapProps {
  events: Event[];
}

// Create a marker element using safe DOM methods (no innerHTML with user data)
function createMarkerElement(isSelected: boolean, theme: "light" | "dark"): HTMLElement {
  const bgColor = isSelected
    ? MARKER_COLORS.selected[theme]
    : MARKER_COLORS.default[theme];

  const markerDiv = document.createElement("div");
  markerDiv.className = "relative cursor-pointer";
  markerDiv.style.transition = "transform 0.2s ease-out";
  markerDiv.style.transform = isSelected ? "scale(1.15)" : "scale(1)";

  const container = document.createElement("div");
  container.style.cssText = "position: relative; display: flex; flex-direction: column; align-items: center;";

  const pill = document.createElement("div");
  pill.setAttribute("data-marker-pill", "true");
  pill.style.cssText = `
    background: ${bgColor};
    border-radius: 20px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.1);
    border: 2px solid white;
  `;

  // Calendar SVG icon (static, no user data)
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z");
  path.setAttribute("stroke", "white");
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  pill.appendChild(svg);

  // Triangle pointer
  const pointer = document.createElement("div");
  pointer.style.cssText = `
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 8px solid ${bgColor};
    margin-top: -2px;
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.15));
  `;

  container.appendChild(pill);
  container.appendChild(pointer);
  markerDiv.appendChild(container);

  return markerDiv;
}

// Create user location marker (blue dot)
function createUserMarker(): HTMLElement {
  const dot = document.createElement("div");
  dot.style.cssText = `
    width: 20px;
    height: 20px;
    background: #3b82f6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5);
  `;
  return dot;
}

export function EventMap({ events }: EventMapProps) {
  const { resolvedTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedTag, setSelectedTag] = useState<EventTag | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const mapInitializedRef = useRef(false);

  // Filter events by selected tag
  const filteredEvents = selectedTag
    ? events.filter(event => event.ai_tags?.includes(selectedTag))
    : events;

  // Events with location data
  const eventsWithLocation = filteredEvents.filter(
    event => event.latitude && event.longitude
  );

  // Load Google Maps script
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key not configured");
      setLoadError("Google Maps API key not configured");
      setIsLoading(false);
      return;
    }

    let timeoutId: NodeJS.Timeout;

    // Check if Google Maps API is fully ready (not just partially loaded)
    const isGoogleMapsReady = () => {
      return (
        typeof google !== "undefined" &&
        google.maps &&
        typeof google.maps.Map === "function"
      );
    };

    const initMap = () => {
      if (!isGoogleMapsReady()) {
        console.error("Google Maps not fully loaded");
        return;
      }

      if (!mapRef.current) {
        console.error("Map container ref not available");
        setLoadError("Failed to initialize map container");
        setIsLoading(false);
        return;
      }

      try {
        // Build map options - mapId controls styling via Cloud Console, so don't set styles
        const mapOptions: google.maps.MapOptions = {
          center: DALAT_CENTER,
          zoom: DEFAULT_ZOOM,
          disableDefaultUI: true,
          zoomControl: true,
          mapId: "dalat-events-map",
          gestureHandling: "greedy",
        };

        // Only set zoomControlOptions if ControlPosition is available
        if (google.maps.ControlPosition) {
          mapOptions.zoomControlOptions = {
            position: google.maps.ControlPosition.RIGHT_CENTER,
          };
        }

        const mapInstance = new google.maps.Map(mapRef.current, mapOptions);

        setMap(mapInstance);
        setIsLoading(false);
        mapInitializedRef.current = true;
        if (timeoutId) clearTimeout(timeoutId);
      } catch (err) {
        console.error("Error initializing map:", err);
        setLoadError("Failed to initialize map");
        setIsLoading(false);
      }
    };

    // Set a timeout to stop loading if map doesn't initialize
    timeoutId = setTimeout(() => {
      if (!mapInitializedRef.current) {
        console.error("Map initialization timed out");
        setLoadError("Map took too long to load. Please refresh the page.");
        setIsLoading(false);
      }
    }, 15000);

    // Check if already loaded
    if (isGoogleMapsReady()) {
      initMap();
      return () => clearTimeout(timeoutId);
    }

    // Check for existing script
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      const checkReady = setInterval(() => {
        if (isGoogleMapsReady()) {
          clearInterval(checkReady);
          initMap();
        }
      }, 100);
      setTimeout(() => clearInterval(checkReady), 10000);
      return () => {
        clearInterval(checkReady);
        clearTimeout(timeoutId);
      };
    }

    // Load script with both marker and places libraries
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker,places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const checkReady = setInterval(() => {
        if (isGoogleMapsReady()) {
          clearInterval(checkReady);
          initMap();
        }
      }, 100);
      setTimeout(() => clearInterval(checkReady), 10000);
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      setLoadError("Failed to load Google Maps");
      setIsLoading(false);
    };
    document.head.appendChild(script);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  // Note: Map styles are controlled via Cloud Console when using mapId
  // Theme-based styling would need to be configured there instead

  // Create markers for events
  useEffect(() => {
    if (!map || typeof google === "undefined" || !google.maps?.marker) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.map = null);
    markersRef.current = [];

    const theme = resolvedTheme === "dark" ? "dark" : "light";

    eventsWithLocation.forEach(event => {
      const markerElement = createMarkerElement(selectedEvent?.id === event.id, theme);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: event.latitude!, lng: event.longitude! },
        content: markerElement,
        title: event.title,
      });

      marker.addListener("click", () => {
        triggerHaptic("selection");
        setSelectedEvent(event);

        // Update marker styles
        markersRef.current.forEach(m => {
          const el = m.content as HTMLElement;
          if (el) {
            const isSelected = m === marker;
            el.style.transform = isSelected ? "scale(1.15)" : "scale(1)";
            const pill = el.querySelector("[data-marker-pill]") as HTMLElement;
            if (pill) {
              pill.style.background = isSelected
                ? MARKER_COLORS.selected[theme]
                : MARKER_COLORS.default[theme];
            }
          }
        });

        // Pan to marker
        map.panTo({ lat: event.latitude!, lng: event.longitude! });
      });

      markersRef.current.push(marker);
    });
  }, [map, eventsWithLocation, selectedEvent?.id, resolvedTheme]);

  // Handle "Near Me" button
  const handleNearMe = useCallback(() => {
    triggerHaptic("selection");

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        if (map && typeof google !== "undefined" && google.maps?.marker) {
          map.panTo({ lat: latitude, lng: longitude });
          map.setZoom(15);

          // Remove previous user marker
          if (userMarkerRef.current) {
            userMarkerRef.current.map = null;
          }

          // Add new user location marker
          userMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: latitude, lng: longitude },
            content: createUserMarker(),
            title: "Your location",
          });
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Unable to get your location. Please check your browser permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [map]);

  const handleTagChange = useCallback((tag: EventTag | null) => {
    setSelectedTag(tag);
    setSelectedEvent(null);
  }, []);

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary underline hover:no-underline"
          >
            Refresh page
          </button>
        </div>
      </div>
    );
  }

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 p-4">
        <p className="text-center text-muted-foreground">
          Map not available. Google Maps API key not configured.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tag filter bar */}
      <div className="p-3 bg-background border-b">
        <TagFilterBar
          selectedTag={selectedTag}
          onTagChange={handleTagChange}
        />
      </div>

      {/* Map container - always rendered so ref is available */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-10">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading map...</p>
            </div>
          </div>
        )}

        {/* Near Me button */}
        <button
          onClick={handleNearMe}
          className="absolute bottom-24 right-4 bg-background hover:bg-muted text-foreground h-12 px-4 rounded-full shadow-lg border border-border flex items-center gap-2 transition-all duration-200 active:scale-95 hover:shadow-xl"
          title="Show my location"
        >
          <Navigation className="w-5 h-5 text-blue-500" />
          <span className="hidden sm:inline font-medium text-sm">Near Me</span>
        </button>

        {/* Selected event card */}
        {selectedEvent && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 bg-background rounded-xl shadow-xl border border-border overflow-hidden">
            <Link href={`/events/${selectedEvent.slug}`} className="block">
              {selectedEvent.image_url && (
                <div className="h-32 bg-muted">
                  <img
                    src={selectedEvent.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-3">
                <h3 className="font-semibold text-sm line-clamp-2 mb-1">
                  {selectedEvent.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {formatInDaLat(selectedEvent.starts_at, "EEE, MMM d · h:mm a")}
                </p>
                {selectedEvent.location_name && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    📍 {selectedEvent.location_name}
                  </p>
                )}
              </div>
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEvent(null);
              }}
              className="absolute top-2 right-2 w-6 h-6 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Empty state */}
        {eventsWithLocation.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center p-4">
              <p className="text-muted-foreground mb-2">
                {selectedTag
                  ? "No events with locations in this category"
                  : "No events with locations to display"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
