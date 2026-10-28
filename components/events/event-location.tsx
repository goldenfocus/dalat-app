import { MapPin, ArrowUpRight } from "lucide-react";
import { getLocationMapLinks, type EventLocation as Location, type LocationVenue } from "@/lib/events/location";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { ReactNode } from "react";

export function EventLocation({ location, directionsLabel, mapLabel, children }: {
  location: Location;
  venue?: LocationVenue | null;
  directionsLabel: string;
  mapLabel: string;
  children?: ReactNode;
}) {
  const links = getLocationMapLinks(location);
  if (!location.location_name && !location.address && !children && !links.map) return null;

  const details = <>
    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary/80" aria-hidden />
    <span className="min-w-0 flex-1 space-y-1">
      {location.location_name && <span className="block font-medium text-foreground">{decodeUnicodeEscapes(location.location_name)}</span>}
      {location.address && <span className="block text-sm leading-relaxed text-muted-foreground">{decodeUnicodeEscapes(location.address)}</span>}
    </span>
  </>;

  return (
    <div data-testid="event-location" className="my-4 space-y-2">
      {links.map ? (
        <a href={links.directions || links.map} target="_blank" rel="noopener noreferrer"
          aria-label={`${location.location_name || location.address || mapLabel} · ${links.directions ? directionsLabel : mapLabel}`}
          className="group flex min-h-14 items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {details}
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
        </a>
      ) : <div className="flex items-start gap-3 py-2">{details}</div>}
      {children}
    </div>
  );
}
