"use client";

import { useState } from "react";
import { MapPin, ExternalLink, Navigation } from "lucide-react";

interface VenueMapProps {
  latitude: number;
  longitude: number;
  name: string;
  address?: string | null;
  directionsLabel: string;
  viewOnMapLabel: string;
}

export function VenueMap({
  latitude,
  longitude,
  name,
  address,
  directionsLabel,
  viewOnMapLabel,
}: VenueMapProps) {
  const [mapError, setMapError] = useState(false);

  // Google Static Maps API URL
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=640x360&scale=2&markers=color:red%7C${latitude},${longitude}&key=${apiKey}`
    : null;

  // Google Maps links
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const directionsLink = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Map Image */}
      <div className="relative aspect-[16/9] bg-muted">
        {mapUrl && !mapError ? (
          <a
            href={mapsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full"
          >
            <img
              src={mapUrl}
              alt={`Map showing ${name}`}
              className="w-full h-full object-cover"
              onError={() => setMapError(true)}
            />
            {/* Subtle overlay for better contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
          </a>
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
          href={directionsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium hover:bg-muted active:scale-[0.98] transition-all"
        >
          <Navigation className="w-4 h-4" />
          {directionsLabel}
        </a>
        <div className="w-px bg-border" />
        <a
          href={mapsLink}
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
