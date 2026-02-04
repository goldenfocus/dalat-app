"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTheme } from "next-themes";
import { useTranslations, useLocale } from "next-intl";
import { Loader2, Navigation } from "lucide-react";
import { startOfDay, endOfDay, isAfter, parseISO } from "date-fns";
import Supercluster from "supercluster";
import type { Event, VenueMapMarker } from "@/lib/types";
import type { EventTag } from "@/lib/constants/event-tags";
import { createVenueMarkerElement } from "./venue-marker";
import { VenuePopupCard } from "./venue-popup-card";
import { EventPopupCard } from "./event-popup-card";
import { MapLegend } from "./map-legend";
import { VENUE_MARKER_COLORS } from "@/lib/constants/venue-types";
import { DALAT_CENTER, DEFAULT_ZOOM, MARKER_COLORS } from "./map-styles";
import { MapFilterBar, type DatePreset } from "./map-filter-bar";
import { triggerHaptic } from "@/lib/haptics";

// Clustering configuration
const CLUSTER_RADIUS = 60; // Cluster radius in pixels
const CLUSTER_MAX_ZOOM = 15; // Stop clustering at this zoom level
const CLUSTER_MIN_POINTS = 2; // Minimum points to form a cluster

// Date preset days lookup
const DATE_PRESET_DAYS: Record<DatePreset, number | null> = {
  "7days": 7,
  "14days": 14,
  "30days": 30,
  "all": null,
  "custom": null,
};

interface EventMapProps {
  events: Event[];
  happeningEventIds?: string[];
  venues?: VenueMapMarker[];
}

// Create a marker element using safe DOM methods (no innerHTML with user data)
function createMarkerElement(
  isSelected: boolean,
  theme: "light" | "dark",
  isHappening: boolean = false
): HTMLElement {
  // Happening events get red color, otherwise green
  const bgColor = isHappening
    ? MARKER_COLORS.happening[theme]
    : isSelected
      ? MARKER_COLORS.selected[theme]
      : MARKER_COLORS.default[theme];

  const markerDiv = document.createElement("div");
  markerDiv.className = "relative cursor-pointer";
  markerDiv.style.transition = "transform 0.2s ease-out";
  markerDiv.style.transform = isSelected ? "scale(1.15)" : "scale(1)";
  if (isHappening) {
    markerDiv.setAttribute("data-happening", "true");
  }

  const container = document.createElement("div");
  container.style.cssText = "position: relative; display: flex; flex-direction: column; align-items: center;";

  // Add pulsing ring for happening events
  if (isHappening) {
    const pulseRing = document.createElement("div");
    pulseRing.style.cssText = `
      position: absolute;
      top: -4px;
      left: -4px;
      right: -4px;
      bottom: 8px;
      border-radius: 24px;
      border: 2px solid ${MARKER_COLORS.happening[theme]};
      animation: pulse-ring 1.5s ease-out infinite;
      pointer-events: none;
    `;
    container.appendChild(pulseRing);
  }

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
    position: relative;
    z-index: 1;
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
    position: relative;
    z-index: 1;
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

// Create cluster marker showing count of grouped events
function createClusterMarker(count: number, theme: "light" | "dark"): HTMLElement {
  // Size scales with count
  const size = count < 10 ? 40 : count < 50 ? 48 : 56;
  const bgColor = MARKER_COLORS.cluster[theme];

  const div = document.createElement("div");
  div.className = "cursor-pointer";
  div.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    background: ${bgColor};
    border-radius: 50%;
    border: 3px solid white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: ${size < 48 ? 14 : 16}px;
    color: white;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4), 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s ease-out;
  `;
  div.textContent = count.toString();

  // Add hover effect
  div.addEventListener("mouseenter", () => {
    div.style.transform = "scale(1.1)";
  });
  div.addEventListener("mouseleave", () => {
    div.style.transform = "scale(1)";
  });

  return div;
}

// Type for supercluster point properties
interface EventPointProperties {
  eventId: string;
  isHappening: boolean;
}

export function EventMap({ events, happeningEventIds = [], venues = [] }: EventMapProps) {
  const t = useTranslations("mapPage");
  const locale = useLocale();
  // Convert to Set for O(1) lookup
  const happeningSet = useMemo(() => new Set(happeningEventIds), [happeningEventIds]);
  const { resolvedTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<VenueMapMarker | null>(null);
  const [selectedTags, setSelectedTags] = useState<EventTag[]>([]);
  const [datePreset, setDatePreset] = useState<DatePreset>("7days");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const mapRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const venueMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const mapInitializedRef = useRef(false);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);

  // Calculate date range based on preset or custom selection
  const dateRange = useMemo(() => {
    // Handle custom date range
    if (datePreset === "custom" && customStartDate && customEndDate) {
      const start = startOfDay(parseISO(customStartDate));
      const end = endOfDay(parseISO(customEndDate));
      // Validate: end should be after start
      if (isAfter(end, start)) {
        return { start, end };
      }
      return null;
    }

    const days = DATE_PRESET_DAYS[datePreset];
    if (!days) return null;

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + days);
    return { start: now, end };
  }, [datePreset, customStartDate, customEndDate]);

  // Events filtered by date only (used for category counts)
  const dateFilteredEvents = useMemo(() => {
    if (!dateRange) return events;
    return events.filter(event => {
      const eventDate = new Date(event.starts_at);
      return eventDate >= dateRange.start && eventDate <= dateRange.end;
    });
  }, [events, dateRange]);

  // Compute category counts from date-filtered events (with location)
  const categoryCounts = useMemo(() => {
    const eventsWithLoc = dateFilteredEvents.filter(e => e.latitude && e.longitude);
    const counts: Partial<Record<EventTag, number>> = {};

    // Count events per tag
    eventsWithLoc.forEach(event => {
      event.ai_tags?.forEach(tag => {
        counts[tag as EventTag] = (counts[tag as EventTag] || 0) + 1;
      });
    });

    return counts as Record<EventTag, number>;
  }, [dateFilteredEvents]);

  // Filter events by date range and tags (multi-select OR logic)
  const filteredEvents = useMemo(() => {
    let result = dateFilteredEvents;

    // Filter by tags (OR logic - match ANY selected tag)
    if (selectedTags.length > 0) {
      result = result.filter(event =>
        selectedTags.some(tag => event.ai_tags?.includes(tag))
      );
    }

    return result;
  }, [dateFilteredEvents, selectedTags]);

  // Events with location data
  const eventsWithLocation = filteredEvents.filter(
    event => event.latitude && event.longitude
  );

  // Create cluster index from events
  const clusterIndex = useMemo(() => {
    const index = new Supercluster<EventPointProperties>({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
      minPoints: CLUSTER_MIN_POINTS,
    });

    const points = eventsWithLocation.map(event => ({
      type: "Feature" as const,
      properties: {
        eventId: event.id,
        isHappening: happeningSet.has(event.id),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [event.longitude!, event.latitude!],
      },
    }));

    index.load(points);
    return index;
  }, [eventsWithLocation, happeningSet]);

  // Map from event ID to event for quick lookup
  const eventsById = useMemo(() => {
    const map = new Map<string, Event>();
    eventsWithLocation.forEach(event => map.set(event.id, event));
    return map;
  }, [eventsWithLocation]);

  // Load Google Maps script
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("Google Maps API key not configured");
      setLoadError("Google Maps API key not configured");
      setIsLoading(false);
      return;
    }

    let timeoutId: NodeJS.Timeout | undefined = undefined;

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
        // Build map options - using mapId for stable rendering
        // Note: For dark mode support, set up Cloud-based styling in Google Cloud Console
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

        // Track zoom changes for clustering
        mapInstance.addListener("zoom_changed", () => {
          const zoom = mapInstance.getZoom();
          if (zoom !== undefined) {
            setCurrentZoom(zoom);
          }
        });

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker,places&loading=async&v=weekly&language=${locale}&region=VN`;
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
  }, []);

  // Note: Legacy map styles (programmatic) were deprecated March 2025
  // For dark mode: Create light/dark Map IDs in Google Cloud Console > Map Styles
  // Then switch mapId based on resolvedTheme

  // Create markers for events with clustering support
  useEffect(() => {
    if (!map || typeof google === "undefined" || !google.maps?.marker) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.map = null);
    markersRef.current = [];

    const theme = resolvedTheme === "dark" ? "dark" : "light";
    const bounds = map.getBounds();
    const zoom = Math.floor(currentZoom);

    // Get clusters/points for current viewport
    let bbox: [number, number, number, number] = [-180, -90, 180, 90]; // Default to world
    if (bounds) {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      bbox = [sw.lng(), sw.lat(), ne.lng(), ne.lat()];
    }

    const clusters = clusterIndex.getClusters(bbox, zoom);

    // Calculate offset for stacked markers at same location (spiral pattern)
    // Only used when not clustering (zoom > CLUSTER_MAX_ZOOM)
    const getOffset = (index: number, total: number): { lat: number; lng: number } => {
      if (total <= 1 || zoom <= CLUSTER_MAX_ZOOM) return { lat: 0, lng: 0 };
      const angle = (index / total) * 2 * Math.PI;
      const radius = 0.0004 + (index * 0.0001);
      return {
        lat: Math.sin(angle) * radius,
        lng: Math.cos(angle) * radius,
      };
    };

    // Group events by location for offset calculation (only at high zoom)
    const locationGroups = new Map<string, string[]>(); // location key -> event IDs
    if (zoom > CLUSTER_MAX_ZOOM) {
      eventsWithLocation.forEach(event => {
        const key = `${event.latitude!.toFixed(4)},${event.longitude!.toFixed(4)}`;
        const group = locationGroups.get(key) || [];
        group.push(event.id);
        locationGroups.set(key, group);
      });
    }

    clusters.forEach(cluster => {
      const [lng, lat] = cluster.geometry.coordinates;
      const props = cluster.properties;

      // Check if it's a cluster (has cluster_id) or a single point
      if ("cluster_id" in props && props.cluster_id !== undefined) {
        // It's a cluster - create cluster marker
        const count = props.point_count || 0;
        const clusterId = props.cluster_id;
        const clusterElement = createClusterMarker(count, theme);

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat, lng },
          content: clusterElement,
          title: `${count} events`,
        });

        // Click to zoom into cluster
        marker.addListener("click", () => {
          triggerHaptic("selection");
          const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
          map.setZoom(Math.min(expansionZoom, 18));
          map.panTo({ lat, lng });
          setSelectedEvent(null); // Clear selection when zooming
        });

        markersRef.current.push(marker);
      } else {
        // It's a single event - props should have eventId
        const eventProps = props as EventPointProperties;
        const eventId = eventProps.eventId;
        const event = eventsById.get(eventId);
        if (!event) return;

        // Calculate offset if multiple events at same location
        const locationKey = `${event.latitude!.toFixed(4)},${event.longitude!.toFixed(4)}`;
        const group = locationGroups.get(locationKey) || [eventId];
        const indexInGroup = group.indexOf(eventId);
        const offset = getOffset(indexInGroup, group.length);

        const isHappening = eventProps.isHappening;
        const markerElement = createMarkerElement(selectedEvent?.id === eventId, theme, isHappening);

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: {
            lat: lat + offset.lat,
            lng: lng + offset.lng,
          },
          content: markerElement,
          title: event.title,
        });

        marker.addListener("click", () => {
          triggerHaptic("selection");
          setSelectedEvent(event);

          // Update marker styles for all single-event markers
          markersRef.current.forEach(m => {
            const el = m.content as HTMLElement;
            if (el && el.querySelector("[data-marker-pill]")) {
              const isSelected = m === marker;
              el.style.transform = isSelected ? "scale(1.15)" : "scale(1)";
              const pill = el.querySelector("[data-marker-pill]") as HTMLElement;
              if (pill) {
                const markerIsHappening = el.getAttribute("data-happening") === "true";
                pill.style.background = markerIsHappening
                  ? MARKER_COLORS.happening[theme]
                  : isSelected
                    ? MARKER_COLORS.selected[theme]
                    : MARKER_COLORS.default[theme];
              }
            }
          });

          map.panTo({ lat: event.latitude!, lng: event.longitude! });
        });

        markersRef.current.push(marker);
      }
    });
  }, [map, eventsWithLocation, eventsById, clusterIndex, currentZoom, selectedEvent?.id, resolvedTheme, happeningSet]);

  // Create venue markers
  useEffect(() => {
    if (!map || typeof google === "undefined" || !google.maps?.marker) return;
    if (!venues.length) return;

    // Clear existing venue markers
    venueMarkersRef.current.forEach(marker => marker.map = null);
    venueMarkersRef.current = [];

    const theme = resolvedTheme === "dark" ? "dark" : "light";

    venues.forEach(venue => {
      const markerElement = createVenueMarkerElement(
        theme,
        venue.upcoming_event_count,
        venue.has_happening_now,
        selectedVenue?.id === venue.id
      );

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: venue.latitude, lng: venue.longitude },
        content: markerElement,
        title: venue.name,
      });

      marker.addListener("click", () => {
        triggerHaptic("selection");
        setSelectedEvent(null); // Clear event selection
        setSelectedVenue(venue);

        // Update venue marker styles
        venueMarkersRef.current.forEach(m => {
          const el = m.content as HTMLElement;
          if (el && el.getAttribute("data-venue-marker")) {
            const isSelected = m === marker;
            el.style.transform = isSelected ? "scale(1.15)" : "scale(1)";
            const pill = el.querySelector("[data-marker-pill]") as HTMLElement;
            if (pill) {
              const markerIsHappening = el.getAttribute("data-happening") === "true";
              const upcomingCount = parseInt(el.getAttribute("data-upcoming-count") || "0");
              let bgColor: string;
              if (markerIsHappening) {
                bgColor = VENUE_MARKER_COLORS.happening[theme];
              } else if (upcomingCount > 0) {
                bgColor = VENUE_MARKER_COLORS.active[theme];
              } else {
                bgColor = VENUE_MARKER_COLORS.default[theme];
              }
              pill.style.background = bgColor;
            }
          }
        });

        map.panTo({ lat: venue.latitude, lng: venue.longitude });
      });

      venueMarkersRef.current.push(marker);
    });
  }, [map, venues, selectedVenue?.id, resolvedTheme]);

  // Handle "Near Me" button
  const handleNearMe = useCallback(() => {
    triggerHaptic("selection");

    if (!navigator.geolocation) {
      alert(t("geolocationNotSupported"));
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
            title: t("nearMe"),
          });
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert(t("locationPermissionError"));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [map, t]);

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 p-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary underline hover:no-underline"
          >
            {t("refreshPage")}
          </button>
        </div>
      </div>
    );
  }

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 p-4">
        <p className="text-center text-muted-foreground">
          {t("mapNotAvailable")}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* New unified filter bar */}
      <MapFilterBar
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onCustomStartDateChange={setCustomStartDate}
        onCustomEndDateChange={setCustomEndDate}
        selectedTags={selectedTags}
        onTagsChange={(tags) => {
          setSelectedTags(tags);
          setSelectedEvent(null);
        }}
        categoryCounts={categoryCounts}
        eventCount={eventsWithLocation.length}
      />

      {/* Map container - always rendered so ref is available */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/80 z-10">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("loadingMap")}</p>
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
          <span className="hidden sm:inline font-medium text-sm">{t("nearMe")}</span>
        </button>

        {/* Map legend */}
        <MapLegend />

        {/* Selected event card */}
        {selectedEvent && (
          <EventPopupCard
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        )}

        {/* Selected venue card */}
        {selectedVenue && !selectedEvent && (
          <VenuePopupCard
            venue={selectedVenue}
            onClose={() => setSelectedVenue(null)}
          />
        )}

        {/* Empty state */}
        {eventsWithLocation.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center p-4">
              <p className="text-muted-foreground mb-2">
                {selectedTags.length > 0
                  ? t("noEventsInCategory")
                  : t("noEventsWithLocation")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
