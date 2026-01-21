"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Wrapper } from "@googlemaps/react-wrapper";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import type { MapAdapterProps } from "../types";
import type { Event } from "@/lib/types";
import { formatInDaLat } from "@/lib/timezone";
import { useLocale } from "next-intl";
import type { Locale } from "@/lib/types";

// Custom map styling - elegant, minimal design that matches dalat.app theme
// Inspired by modern map designs with muted colors and clean aesthetics
const MAP_STYLES: google.maps.MapTypeStyle[] = [
    // Overall map background - soft warm grey
    {
        elementType: "geometry",
        stylers: [{ color: "#f5f5f5" }],
    },
    // Labels - subtle and elegant
    {
        elementType: "labels.text.fill",
        stylers: [{ color: "#616161" }],
    },
    {
        elementType: "labels.text.stroke",
        stylers: [{ color: "#f5f5f5" }],
    },
    // Water - soft blue-grey
    {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#c9d6df" }],
    },
    {
        featureType: "water",
        elementType: "labels.text.fill",
        stylers: [{ color: "#9e9e9e" }],
    },
    // Roads - clean, minimal
    {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#ffffff" }],
    },
    {
        featureType: "road",
        elementType: "labels.text.fill",
        stylers: [{ color: "#9e9e9e" }],
    },
    {
        featureType: "road.highway",
        elementType: "geometry",
        stylers: [{ color: "#dadada" }],
    },
    {
        featureType: "road.highway",
        elementType: "labels.text.fill",
        stylers: [{ color: "#616161" }],
    },
    {
        featureType: "road.arterial",
        elementType: "geometry",
        stylers: [{ color: "#ffffff" }],
    },
    {
        featureType: "road.local",
        elementType: "geometry",
        stylers: [{ color: "#ffffff" }],
    },
    // Parks and nature - soft green accents
    {
        featureType: "poi.park",
        elementType: "geometry",
        stylers: [{ color: "#e5f4e3" }],
    },
    {
        featureType: "poi.park",
        elementType: "labels.text.fill",
        stylers: [{ color: "#6b9a76" }],
    },
    // Hide most POI labels for cleaner look
    {
        featureType: "poi",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
    },
    // Show park labels only
    {
        featureType: "poi.park",
        elementType: "labels",
        stylers: [{ visibility: "on" }],
    },
    // Transit - simplified
    {
        featureType: "transit",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "transit.station",
        elementType: "labels",
        stylers: [{ visibility: "simplified" }],
    },
    // Administrative boundaries - subtle
    {
        featureType: "administrative",
        elementType: "geometry.stroke",
        stylers: [{ color: "#c9c9c9" }],
    },
    {
        featureType: "administrative.land_parcel",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
    },
    {
        featureType: "administrative.neighborhood",
        elementType: "labels.text.fill",
        stylers: [{ color: "#a3a3a3" }],
    },
    // Landscape - natural colors
    {
        featureType: "landscape.natural",
        elementType: "geometry",
        stylers: [{ color: "#f0f0f0" }],
    },
    {
        featureType: "landscape.man_made",
        elementType: "geometry",
        stylers: [{ color: "#f5f5f5" }],
    },
];

interface GoogleMapComponentProps extends MapAdapterProps {
    apiKey: string;
}

function GoogleMapComponent({
    events,
    selectedEventId,
    onEventSelect,
    defaultCenter = [11.9404, 108.4583], // Da Lat
    defaultZoom = 13,
    className,
    apiKey,
}: GoogleMapComponentProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const googleMapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
    const clustererRef = useRef<MarkerClusterer | null>(null);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
    const locale = useLocale() as Locale;

    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [radiusCircle, setRadiusCircle] = useState<google.maps.Circle | null>(null);
    const eventIdsRef = useRef<string>('');
    const markerMapRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());

    // Initialize map
    useEffect(() => {
        if (!mapRef.current || googleMapRef.current) return;

        const map = new google.maps.Map(mapRef.current, {
            center: { lat: defaultCenter[0], lng: defaultCenter[1] },
            zoom: defaultZoom,
            styles: MAP_STYLES,
            mapId: "dalat-events-map", // Required for AdvancedMarkerElement
            disableDefaultUI: true,
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_BOTTOM,
            },
            gestureHandling: "greedy",
        });

        googleMapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();
    }, [defaultCenter, defaultZoom]);

    // Create marker element with refined design
    const createMarkerElement = useCallback((event: Event, isSelected: boolean): HTMLElement => {
        const markerDiv = document.createElement("div");
        markerDiv.className = "relative cursor-pointer";
        markerDiv.style.cssText = `
            transition: transform 0.2s ease-out;
            transform: ${isSelected ? "scale(1.15)" : "scale(1)"};
        `;

        // Add hover effect via event listener
        markerDiv.addEventListener("mouseenter", () => {
            if (!isSelected) markerDiv.style.transform = "scale(1.1)";
        });
        markerDiv.addEventListener("mouseleave", () => {
            if (!isSelected) markerDiv.style.transform = "scale(1)";
        });

        // Modern marker design - pill shape with icon
        const bgColor = isSelected ? "#16a34a" : "#22c55e"; // green-600 : green-500
        const shadowOpacity = isSelected ? "0.4" : "0.25";

        markerDiv.innerHTML = `
            <div style="
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: center;
            ">
                <div style="
                    background: ${bgColor};
                    border-radius: 20px;
                    padding: 6px 10px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, ${shadowOpacity}), 0 2px 4px rgba(0, 0, 0, 0.1);
                    border: 2px solid white;
                ">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div style="
                    width: 0;
                    height: 0;
                    border-left: 6px solid transparent;
                    border-right: 6px solid transparent;
                    border-top: 8px solid ${bgColor};
                    margin-top: -2px;
                    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.15));
                "></div>
            </div>
        `;

        return markerDiv;
    }, []);

    // Generate InfoWindow HTML
    const createInfoWindowContent = useCallback((event: Event): string => {
        const imageUrl = event.image_url || '/images/event-placeholder.jpg';
        const dateStr = formatInDaLat(event.starts_at, "EEE, MMM d · h:mm a", locale);

        return `
            <div class="max-w-sm">
                <div class="aspect-video w-full overflow-hidden rounded-t-lg">
                    <img src="${imageUrl}" alt="${event.title}" class="w-full h-full object-cover" />
                </div>
                <div class="p-4">
                    <h3 class="font-bold text-lg mb-2 line-clamp-2">${event.title}</h3>
                    <div class="text-sm text-gray-600 space-y-1 mb-3">
                        <div class="flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>${dateStr}</span>
                        </div>
                        ${event.location_name ? `
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span class="line-clamp-1">${event.location_name}</span>
                            </div>
                        ` : ''}
                    </div>
                    <div class="flex gap-2">
                        <a href="/events/${event.slug}" class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg text-center transition-colors">
                            View Details
                        </a>
                        ${event.latitude && event.longitude ? `
                            <a href="https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}" target="_blank" rel="noopener noreferrer" class="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors">
                                Directions
                            </a>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }, [locale]);

    // Update markers when events or selection changes
    useEffect(() => {
        if (!googleMapRef.current) return;

        const map = googleMapRef.current;

        // Check if event list has actually changed
        const currentEventIds = events.map(e => e.id).sort().join(',');
        const eventsChanged = currentEventIds !== eventIdsRef.current;

        if (eventsChanged) {
            // Full rebuild needed - event list changed
            eventIdsRef.current = currentEventIds;

            // Clear existing markers and map
            markersRef.current.forEach(marker => {
                marker.map = null;
            });
            markersRef.current = [];
            markerMapRef.current.clear();

            // Clear existing clusterer
            if (clustererRef.current) {
                clustererRef.current.clearMarkers();
            }

            // Create new markers
            const newMarkers = events
                .filter(event => event.latitude && event.longitude)
                .map(event => {
                    const isSelected = event.id === selectedEventId;
                    const markerElement = createMarkerElement(event, isSelected);

                    const marker = new google.maps.marker.AdvancedMarkerElement({
                        map,
                        position: { lat: event.latitude!, lng: event.longitude! },
                        content: markerElement,
                        title: event.title,
                    });

                    // Click handler
                    marker.addListener("click", () => {
                        onEventSelect(event);

                        // Show InfoWindow
                        if (infoWindowRef.current) {
                            infoWindowRef.current.setContent(createInfoWindowContent(event));
                            infoWindowRef.current.open({
                                map,
                                anchor: marker,
                            });
                        }

                        // Center map on marker
                        map.panTo({ lat: event.latitude!, lng: event.longitude! });
                    });

                    markerMapRef.current.set(event.id, marker);
                    return marker;
                });

            markersRef.current = newMarkers;

            // Initialize MarkerClusterer
            if (newMarkers.length > 0) {
                clustererRef.current = new MarkerClusterer({
                    map,
                    markers: newMarkers,
                    algorithm: new SuperClusterAlgorithm({
                        maxZoom: 14, // Don't cluster beyond zoom level 14
                        radius: 60,
                    }),
                    renderer: {
                        render: ({ count, position }) => {
                            const markerDiv = document.createElement("div");
                            markerDiv.style.cssText = `
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                width: 44px;
                                height: 44px;
                                background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                                color: white;
                                font-weight: 700;
                                font-size: 14px;
                                border-radius: 50%;
                                box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4), 0 2px 4px rgba(0, 0, 0, 0.1);
                                border: 3px solid white;
                                cursor: pointer;
                                transition: transform 0.2s ease-out;
                            `;
                            markerDiv.textContent = count.toString();

                            // Add hover effect
                            markerDiv.addEventListener("mouseenter", () => {
                                markerDiv.style.transform = "scale(1.1)";
                            });
                            markerDiv.addEventListener("mouseleave", () => {
                                markerDiv.style.transform = "scale(1)";
                            });

                            return new google.maps.marker.AdvancedMarkerElement({
                                map,
                                position,
                                content: markerDiv,
                            });
                        },
                    },
                });
            }
        } else if (selectedEventId) {
            // Just update selected marker appearance (performance optimization)
            markersRef.current.forEach(marker => {
                const event = events.find(e =>
                    e.latitude === marker.position?.lat &&
                    e.longitude === marker.position?.lng
                );
                if (event) {
                    const isSelected = event.id === selectedEventId;
                    const newElement = createMarkerElement(event, isSelected);
                    marker.content = newElement;
                }
            });
        }
    }, [events, selectedEventId, onEventSelect, createMarkerElement, createInfoWindowContent]);

    // "Near Me" button handler
    const handleNearMe = useCallback(() => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };

                setUserLocation(pos);

                if (googleMapRef.current) {
                    googleMapRef.current.panTo(pos);
                    googleMapRef.current.setZoom(14);

                    // Add user location marker (pulsing blue dot)
                    const userMarkerDiv = document.createElement("div");
                    userMarkerDiv.className = "relative";
                    userMarkerDiv.innerHTML = `
                        <div class="absolute inset-0 bg-blue-500 rounded-full opacity-30 animate-ping"></div>
                        <div class="relative w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg"></div>
                    `;

                    new google.maps.marker.AdvancedMarkerElement({
                        map: googleMapRef.current,
                        position: pos,
                        content: userMarkerDiv,
                        title: "Your Location",
                    });
                }
            },
            () => {
                alert("Unable to retrieve your location");
            }
        );
    }, []);

    // Draw radius circle (for distance filter visualization)
    const drawRadiusCircle = useCallback((center: { lat: number; lng: number }, radiusKm: number) => {
        if (!googleMapRef.current) return;

        // Remove existing circle
        if (radiusCircle) {
            radiusCircle.setMap(null);
        }

        const circle = new google.maps.Circle({
            map: googleMapRef.current,
            center,
            radius: radiusKm * 1000, // Convert km to meters
            fillColor: "#22c55e",
            fillOpacity: 0.15,
            strokeColor: "#22c55e",
            strokeOpacity: 0.5,
            strokeWeight: 2,
        });

        setRadiusCircle(circle);
    }, [radiusCircle]);

    return (
        <div className={`relative ${className}`}>
            <div ref={mapRef} className="w-full h-full" />

            {/* Near Me Button - Floating action button style */}
            <button
                onClick={handleNearMe}
                className="absolute bottom-24 right-4 bg-white hover:bg-gray-50 text-gray-700 h-12 px-4 rounded-full shadow-lg border border-gray-100 flex items-center gap-2 transition-all duration-200 active:scale-95 hover:shadow-xl"
                title="Show my location"
            >
                <div className="w-5 h-5 relative">
                    <div className="absolute inset-0 bg-blue-500 rounded-full opacity-0 hover:opacity-20 transition-opacity" />
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="3" strokeWidth={2} />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v2m0 16v2M2 12h2m16 0h2" />
                    </svg>
                </div>
                <span className="hidden sm:inline font-medium text-sm">Near Me</span>
            </button>
        </div>
    );
}

export function GoogleMapsAdapter(props: MapAdapterProps) {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

    if (!apiKey) {
        return (
            <div className={`flex flex-col items-center justify-center bg-gray-100 p-8 text-center ${props.className}`}>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-sm">
                    <h3 className="font-bold text-lg mb-2">Google Maps API Key Required</h3>
                    <p className="text-gray-600 mb-4 text-sm">
                        To use Google Maps, add your API key to the environment variables.
                    </p>
                    <div className="text-xs font-mono bg-gray-50 p-3 rounded border border-gray-200 text-left">
                        NEXT_PUBLIC_GOOGLE_MAPS_KEY=your_key_here
                        <br />
                        <br />
                        Get a key at: console.cloud.google.com
                    </div>
                </div>
            </div>
        );
    }

    return (
        <Wrapper apiKey={apiKey} version="beta" libraries={["marker"]}>
            <GoogleMapComponent {...props} apiKey={apiKey} />
        </Wrapper>
    );
}
