/**
 * Google Maps styling for dalat.app
 *
 * Adapted from Chao's original light mode design with added dark mode support.
 * Uses elegant, minimal styling that matches the app's aesthetic.
 */

// Light mode: soft warm greys, muted colors, clean aesthetics
const LIGHT_MODE_STYLES: google.maps.MapTypeStyle[] = [
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

// Dark mode: deep greys, subtle contrast, muted highlights
const DARK_MODE_STYLES: google.maps.MapTypeStyle[] = [
  // Overall map background - deep grey
  {
    elementType: "geometry",
    stylers: [{ color: "#1a1a1a" }],
  },
  // Labels - muted light text
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#a0a0a0" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#1a1a1a" }],
  },
  // Water - dark blue-grey
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#2d3748" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b7280" }],
  },
  // Roads - slightly lighter than background
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2a2a2a" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b7280" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3a3a3a" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca3af" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#2a2a2a" }],
  },
  {
    featureType: "road.local",
    elementType: "geometry",
    stylers: [{ color: "#252525" }],
  },
  // Parks and nature - muted green
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#1e3a2f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4ade80" }],
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
    stylers: [{ color: "#3a3a3a" }],
  },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b7280" }],
  },
  // Landscape - dark tones
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#1e1e1e" }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry",
    stylers: [{ color: "#1a1a1a" }],
  },
];

export function getMapStyles(theme: "light" | "dark"): google.maps.MapTypeStyle[] {
  return theme === "dark" ? DARK_MODE_STYLES : LIGHT_MODE_STYLES;
}

// Marker colors that work with both themes
export const MARKER_COLORS = {
  default: {
    light: "#22c55e", // green-500
    dark: "#4ade80",  // green-400
  },
  selected: {
    light: "#16a34a", // green-600
    dark: "#22c55e",  // green-500
  },
};

// Da Lat center coordinates
export const DALAT_CENTER = {
  lat: 11.9404,
  lng: 108.4583,
};

export const DEFAULT_ZOOM = 13;
