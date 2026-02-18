"use client";

import { useState, useCallback } from "react";
import { MapPin, ExternalLink, Navigation } from "lucide-react";
import { toast } from "sonner";

interface VenueMapProps {
  latitude: number;
  longitude: number;
  name: string;
  address?: string | null;
  directionsLabel: string;
  viewOnMapLabel: string;
  addressCopiedLabel?: string;
  locale?: string;
}

export function VenueMap({
  latitude,
  longitude,
  name,
  address,
  directionsLabel,
  viewOnMapLabel,
  addressCopiedLabel,
  locale,
}: VenueMapProps) {
  const [mapError, setMapError] = useState(false);

  // Google Static Maps API URL — pass language param so labels match page locale
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const langParam = locale ? `&language=${locale}` : "";
  const mapUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=15&size=640x360&scale=2&markers=color:red%7C${latitude},${longitude}${langParam}&region=VN&key=${apiKey}`
    : null;

  // Google Maps links
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const directionsLink = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  const copyAddress = useCallback(async () => {
    const textToCopy = address || `${latitude}, ${longitude}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      // Fallback for restricted contexts
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    toast.success(addressCopiedLabel || "Address copied!");
  }, [address, latitude, longitude, addressCopiedLabel]);

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Map Image — tap to copy address */}
      <div className="relative aspect-[16/9] bg-muted">
        {mapUrl && !mapError ? (
          <button
            type="button"
            onClick={copyAddress}
            className="block w-full h-full cursor-pointer active:scale-[0.99] transition-transform"
          >
            <img
              src={mapUrl}
              alt={`Map showing ${name}`}
              className="w-full h-full object-cover"
              onError={() => setMapError(true)}
            />
            {/* Subtle overlay for better contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
          </button>
        ) : (
          <button
            type="button"
            onClick={copyAddress}
            className="w-full h-full flex flex-col items-center justify-center text-muted-foreground cursor-pointer"
          >
            <MapPin className="w-8 h-8 mb-2" />
            <p className="text-sm">{address || name}</p>
          </button>
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
