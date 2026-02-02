/**
 * Utilities for parsing coordinates and Google Maps URLs
 * Used by LocationPicker to support direct coordinate/URL input
 */

export interface ParsedCoordinates {
  latitude: number;
  longitude: number;
  source: "coordinates" | "google-maps-url" | "short-url";
}

/**
 * Parse raw coordinate input (e.g., "12.345, 67.890" or "12.345 67.890")
 * Returns null if input doesn't match coordinate pattern
 */
export function parseCoordinates(input: string): ParsedCoordinates | null {
  const trimmed = input.trim();

  // Pattern: two decimal numbers separated by comma, space, or both
  // Supports negative values for southern/western hemispheres
  const pattern = /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/;
  const match = trimmed.match(pattern);

  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);

  // Validate coordinate ranges
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return {
    latitude: lat,
    longitude: lng,
    source: "coordinates",
  };
}

/**
 * Check if input looks like a Google Maps URL
 */
export function isGoogleMapsUrl(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return (
    trimmed.includes("google.com/maps") ||
    trimmed.includes("maps.google.com") ||
    trimmed.includes("goo.gl/maps") ||
    trimmed.includes("maps.app.goo.gl")
  );
}

/**
 * Check if URL is a short Google Maps link that needs resolution
 */
export function isShortGoogleMapsUrl(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return (
    trimmed.includes("goo.gl/maps") ||
    trimmed.includes("maps.app.goo.gl")
  );
}

/**
 * Extract coordinates from a full Google Maps URL
 *
 * Supported formats:
 * - https://www.google.com/maps/@12.345,67.890,15z
 * - https://www.google.com/maps/place/Name/@12.345,67.890,15z
 * - https://www.google.com/maps?q=12.345,67.890
 * - https://maps.google.com/?q=12.345,67.890
 * - https://www.google.com/maps/search/12.345,+67.890
 * - Plus codes like https://www.google.com/maps/place/87P4+XM...
 */
export function parseGoogleMapsUrl(input: string): ParsedCoordinates | null {
  const trimmed = input.trim();

  // Skip short URLs - they need API resolution
  if (isShortGoogleMapsUrl(trimmed)) {
    return null;
  }

  // Pattern 1: /@lat,lng in URL path (most common)
  // e.g., /maps/@12.345,67.890,15z or /maps/place/Name/@12.345,67.890
  const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const atMatch = trimmed.match(atPattern);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng, source: "google-maps-url" };
    }
  }

  // Pattern 2: ?q=lat,lng or &q=lat,lng query parameter
  const qPattern = /[?&]q=(-?\d+\.?\d*)[,+](-?\d+\.?\d*)/;
  const qMatch = trimmed.match(qPattern);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng, source: "google-maps-url" };
    }
  }

  // Pattern 3: /search/lat,+lng or /search/lat,lng
  const searchPattern = /\/search\/(-?\d+\.?\d*)[,+\s]+(-?\d+\.?\d*)/;
  const searchMatch = trimmed.match(searchPattern);
  if (searchMatch) {
    const lat = parseFloat(searchMatch[1]);
    const lng = parseFloat(searchMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng, source: "google-maps-url" };
    }
  }

  // Pattern 4: ll=lat,lng parameter (older format)
  const llPattern = /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const llMatch = trimmed.match(llPattern);
  if (llMatch) {
    const lat = parseFloat(llMatch[1]);
    const lng = parseFloat(llMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng, source: "google-maps-url" };
    }
  }

  // Pattern 5: !3d{lat}!4d{lng} in data parameter (common in share URLs)
  // e.g., data=...!3d11.9002492!4d108.4359672...
  const dataPattern = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/;
  const dataMatch = trimmed.match(dataPattern);
  if (dataMatch) {
    const lat = parseFloat(dataMatch[1]);
    const lng = parseFloat(dataMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng, source: "google-maps-url" };
    }
  }

  // Pattern 6: !8m2!3d{lat}!4d{lng} variant
  const dataPattern2 = /!8m2!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/;
  const dataMatch2 = trimmed.match(dataPattern2);
  if (dataMatch2) {
    const lat = parseFloat(dataMatch2[1]);
    const lng = parseFloat(dataMatch2[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng, source: "google-maps-url" };
    }
  }

  return null;
}

/**
 * Validate that coordinates are within valid ranges
 */
function isValidCoordinate(lat: number, lng: number): boolean {
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

/**
 * Try to parse input as either coordinates or Google Maps URL
 * Returns null if neither format is detected
 */
export function parseLocationInput(input: string): ParsedCoordinates | null {
  // First try direct coordinates
  const coords = parseCoordinates(input);
  if (coords) return coords;

  // Then try Google Maps URL
  const fromUrl = parseGoogleMapsUrl(input);
  if (fromUrl) return fromUrl;

  return null;
}

/**
 * Generate a Google Maps URL from coordinates
 */
export function generateGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * Generate a readable location name from coordinates
 * For hiking/outdoor locations without a place name
 */
export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}°${latDir}, ${Math.abs(lng).toFixed(5)}°${lngDir}`;
}
