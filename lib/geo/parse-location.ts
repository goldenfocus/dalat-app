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
 * Parse raw coordinate input in various formats:
 * - Decimal: "12.345, 67.890" or "12.345 67.890"
 * - With degree symbols: "12.345°N, 67.890°E" or "12.345°N 67.890°E"
 * - DMS: "12°20'42"N 67°53'24"E" (approximate conversion)
 *
 * Returns null if input doesn't match any coordinate pattern
 */
export function parseCoordinates(input: string): ParsedCoordinates | null {
  const trimmed = input.trim();

  // Pattern 1: Simple decimal (most common)
  // e.g., "12.345, 67.890" or "12.345 67.890" or "-12.345, -67.890"
  const simplePattern = /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/;
  const simpleMatch = trimmed.match(simplePattern);
  if (simpleMatch) {
    const lat = parseFloat(simpleMatch[1]);
    const lng = parseFloat(simpleMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng, source: "coordinates" };
    }
  }

  // Pattern 2: With degree symbols and cardinal directions
  // e.g., "12.345°N, 67.890°E" or "12.345°N 67.890°E"
  const degreePattern = /^(\d+\.?\d*)°([NS])[,\s]+(\d+\.?\d*)°([EW])$/i;
  const degreeMatch = trimmed.match(degreePattern);
  if (degreeMatch) {
    let lat = parseFloat(degreeMatch[1]);
    let lng = parseFloat(degreeMatch[3]);
    // Apply sign based on cardinal direction
    if (degreeMatch[2].toUpperCase() === "S") lat = -lat;
    if (degreeMatch[4].toUpperCase() === "W") lng = -lng;
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng, source: "coordinates" };
    }
  }

  // Pattern 3: DMS format (degrees, minutes, seconds)
  // e.g., "11°54'00.9"N 108°26'09.5"E" or "11°54'00.9\"N 108°26'09.5\"E"
  const dmsPattern = /^(\d+)°(\d+)'([\d.]+)[""']?\s*([NS])[,\s]+(\d+)°(\d+)'([\d.]+)[""']?\s*([EW])$/i;
  const dmsMatch = trimmed.match(dmsPattern);
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
    let lng = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[4].toUpperCase() === "S") lat = -lat;
    if (dmsMatch[8].toUpperCase() === "W") lng = -lng;
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng, source: "coordinates" };
    }
  }

  return null;
}


/**
 * Check if input looks like a Google Maps URL
 */
export function isGoogleMapsUrl(input: string): boolean {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    return (url.hostname === "maps.app.goo.gl")
      || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/"))
      || (url.hostname === "maps.google.com")
      || ((url.hostname === "google.com" || url.hostname === "www.google.com") && url.pathname.startsWith("/maps"));
  } catch { return false; }
}

/**
 * Check if URL is a short Google Maps link that needs resolution
 */
export function isShortGoogleMapsUrl(input: string): boolean {
  if (!isGoogleMapsUrl(input)) return false;
  const url = new URL(input.trim());
  return url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl";
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
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (!isGoogleMapsUrl(input) || isShortGoogleMapsUrl(input)) return null;
  let text: string;
  try { text = decodeURIComponent(url.pathname + url.search); } catch { return null; }
  const point = (match: RegExpMatchArray | null): ParsedCoordinates | null => {
    if (!match) return null;
    const latitude = Number(match[1]), longitude = Number(match[2]);
    return isValidCoordinate(latitude, longitude)
      ? { latitude, longitude, source: "google-maps-url" } : null;
  };

  // A place's pin is authoritative. @lat,lng describes only the camera view,
  // which may be kilometres away after the user pans or zooms before sharing.
  const pin = point(text.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/));
  if (pin) return pin;
  for (const key of ["destination", "query", "q", "ll"]) {
    const value = url.searchParams.get(key);
    const coordinates = value && parseCoordinates(value);
    if (coordinates) return { ...coordinates, source: "google-maps-url" };
  }
  const search = point(text.match(/\/search\/(-?\d+\.?\d*)[, +]+(-?\d+\.?\d*)/));
  if (search) return search;
  return point(text.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/));
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
