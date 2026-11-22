import { getLocationMapLinks, hasCoordinates } from "@/lib/events/location";
import { MapPin, ExternalLink, Navigation } from "lucide-react";

interface VenueMapProps {
  latitude: number;
  longitude: number;
  name: string;
  address?: string | null;
  googleMapsUrl?: string | null;
  approximate?: boolean;
  directionsLabel: string;
  viewOnMapLabel: string;
}

function getMapEmbedUrl(latitude: number, longitude: number) {
  const bounds = [
    Math.max(-180, longitude - 0.0075),
    Math.max(-90, latitude - 0.0045),
    Math.min(180, longitude + 0.0075),
    Math.min(90, latitude + 0.0045),
  ];
  const query = new URLSearchParams({
    bbox: bounds.map((coordinate) => coordinate.toFixed(7)).join(","),
    layer: "mapnik",
    marker: `${latitude},${longitude}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${query}`;
}

export function VenueMap({
  latitude,
  longitude,
  name,
  address,
  googleMapsUrl,
  approximate = false,
  directionsLabel,
  viewOnMapLabel,
}: VenueMapProps) {
  const coordinates = { latitude, longitude };
  const mapUrl = !approximate && hasCoordinates(coordinates)
    ? getMapEmbedUrl(latitude, longitude)
    : null;

  const links = getLocationMapLinks({
    latitude: approximate ? null : latitude,
    longitude: approximate ? null : longitude,
    google_maps_url: googleMapsUrl,
    location_name: name, address,
  });
  // A street-level geocode is not a restaurant entrance. Open the supplied
  // listing instead of asking Google to route to a guessed coordinate.
  const mapsLink = links.map;
  const directionsLink = links.directions || links.map;

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Map preview */}
      <div className="relative aspect-[16/9] bg-muted">
        {mapUrl ? (
          <iframe
            src={mapUrl}
            title={`${viewOnMapLabel} · ${name}`}
            loading="lazy"
            className="block h-full w-full border-0"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <MapPin className="w-8 h-8 mb-2" />
            <p className="text-sm">{address || name}</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex border-t border-border">
        <a
          href={directionsLink ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium hover:bg-muted active:scale-[0.98] transition-all"
        >
          <Navigation className="w-4 h-4" />
          {directionsLabel}
        </a>
        <div className="w-px bg-border" />
        <a
          href={mapsLink ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium hover:bg-muted active:scale-[0.98] transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          {viewOnMapLabel}
        </a>
      </div>
    </div>
  );
}
