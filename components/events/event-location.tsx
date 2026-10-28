import { MapPin, Navigation, ExternalLink } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { CopyAddress } from "@/components/events/copy-address";
import { getLocationMapLinks, type EventLocation as Location, type LocationVenue } from "@/lib/events/location";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { ReactNode } from "react";

export function EventLocation({ location, venue, directionsLabel, mapLabel, children }: {
  location: Location;
  venue?: LocationVenue | null;
  directionsLabel: string;
  mapLabel: string;
  children?: ReactNode;
}) {
  const links = getLocationMapLinks(location);
  if (!location.location_name && !location.address && !children && !links.map) return null;

  return (
    <div data-testid="event-location" className="my-4 rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <MapPin className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0 space-y-1">
          {location.location_name && (venue ? (
            <Link href={`/venues/${venue.slug}`} className="font-medium hover:underline">
              {decodeUnicodeEscapes(location.location_name)}
            </Link>
          ) : <p className="font-medium">{decodeUnicodeEscapes(location.location_name)}</p>)}
          {location.address && <CopyAddress address={location.address} />}
          {children}
        </div>
      </div>
      {links.map && (
        <div className="flex flex-wrap gap-2">
          <a href={links.directions || links.map} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {links.directions ? <Navigation className="h-4 w-4 shrink-0" /> : <ExternalLink className="h-4 w-4 shrink-0" />}
            {links.directions ? directionsLabel : mapLabel}
          </a>
          {links.directions && (
            <a href={links.map} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
              <ExternalLink className="h-4 w-4 shrink-0" />{mapLabel}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
