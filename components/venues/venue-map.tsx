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

const ZOOM = 15;
const TILE_SIZE = 256;
const WORLD_TILES = 2 ** ZOOM;
const PREVIEW_WIDTH = 384;
const PREVIEW_HEIGHT = 216;
const MAX_MERCATOR_LATITUDE = 85.05112878;

function getMapTiles(latitude: number, longitude: number) {
  const worldSize = TILE_SIZE * WORLD_TILES;
  const centerX = ((longitude + 180) / 360) * worldSize;
  const radians = (latitude * Math.PI) / 180;
  const centerY =
    ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * worldSize;
  const left = centerX - PREVIEW_WIDTH / 2;
  const top = centerY - PREVIEW_HEIGHT / 2;
  const firstRow = Math.max(0, Math.floor(top / TILE_SIZE));
  const lastRow = Math.min(
    WORLD_TILES - 1,
    Math.ceil((top + PREVIEW_HEIGHT) / TILE_SIZE) - 1,
  );
  const firstColumn = Math.floor(left / TILE_SIZE);
  const lastColumn = Math.ceil((left + PREVIEW_WIDTH) / TILE_SIZE) - 1;
  const tiles = [];

  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const wrappedColumn = (column + WORLD_TILES) % WORLD_TILES;
      tiles.push({
        url: `https://tile.openstreetmap.org/${ZOOM}/${wrappedColumn}/${row}.png`,
        left: ((column * TILE_SIZE - left) / PREVIEW_WIDTH) * 100,
        top: ((row * TILE_SIZE - top) / PREVIEW_HEIGHT) * 100,
      });
    }
  }

  return tiles;
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
  const tiles =
    !approximate &&
    hasCoordinates(coordinates) &&
    Math.abs(latitude) <= MAX_MERCATOR_LATITUDE
      ? getMapTiles(latitude, longitude)
      : [];

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
        {tiles.length > 0 && mapsLink ? (
          <>
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${viewOnMapLabel} · ${name}`}
              className="absolute inset-0 overflow-hidden"
            >
              {tiles.map((tile) => (
                <img
                  key={tile.url}
                  src={tile.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="origin"
                  className="absolute max-w-none"
                  style={{
                    left: `${tile.left}%`,
                    top: `${tile.top}%`,
                    width: `${(TILE_SIZE / PREVIEW_WIDTH) * 100}%`,
                    height: `${(TILE_SIZE / PREVIEW_HEIGHT) * 100}%`,
                  }}
                />
              ))}
              <MapPin
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-full fill-red-600 text-white drop-shadow"
              />
            </a>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-0 right-0 bg-white/95 px-1.5 py-0.5 text-[11px] text-slate-900 hover:underline"
            >
              © OpenStreetMap
            </a>
          </>
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
