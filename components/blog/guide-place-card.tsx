"use client";

import { useState } from "react";
import {
  AlertCircle,
  Clock3,
  ExternalLink,
  Info,
  MapPin,
  Phone,
} from "lucide-react";
import type { GuidePlaceCardData } from "@/lib/blog/guide-place";

interface GuidePlaceCardProps {
  place: GuidePlaceCardData;
}

export function GuidePlaceCard({ place }: GuidePlaceCardProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article
      data-guide-place-card
      className="not-prose group my-7 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl"
    >
      <div className="grid sm:grid-cols-[minmax(0,0.88fr)_minmax(0,1.3fr)]">
        <a
          href={place.detailsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open details for ${place.name}`}
          className="relative block min-h-56 overflow-hidden bg-gradient-to-br from-primary/20 via-muted to-background sm:min-h-full"
        >
          {!imageFailed ? (
            // These assets are curated onto cdn.dalat.app and keep their source credit below.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={place.imageUrl}
              alt={place.imageAlt}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <MapPin className="h-12 w-12 text-primary/60" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/10" />
          <span className="absolute left-4 top-4 flex h-10 min-w-10 items-center justify-center rounded-full border border-white/30 bg-black/45 px-3 text-sm font-bold text-white shadow-lg backdrop-blur-md">
            {place.position}
          </span>
          <span className="absolute right-4 top-4 rounded-full border border-white/25 bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            {place.type}
          </span>
          <span className="absolute bottom-3 left-4 right-4 text-xs text-white/75">
            Image: {place.imageCredit}
          </span>
        </a>

        <div className="flex min-w-0 flex-col p-5 sm:p-6">
          <div className="mb-4">
            <a
              href={place.detailsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg text-xl font-bold text-foreground transition-colors hover:text-primary active:scale-[0.99] sm:text-2xl"
            >
              {place.name}
              <ExternalLink className="h-4 w-4 flex-none opacity-60" />
            </a>
            <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
              {place.description}
            </p>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 flex-none text-primary" />
              <div>
                <dt className="sr-only">Address</dt>
                <dd className="leading-5 text-foreground/85">{place.address}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 flex-none text-primary" />
              <div>
                <dt className="sr-only">Opening hours</dt>
                <dd className="leading-5 text-foreground/85">{place.hours}</dd>
              </div>
            </div>
            {place.phone && (
              <div className="flex gap-3">
                <Phone className="mt-0.5 h-4 w-4 flex-none text-primary" />
                <div>
                  <dt className="sr-only">Phone</dt>
                  <dd className="leading-5 text-foreground/85">{place.phone}</dd>
                </div>
              </div>
            )}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {place.amenities.map((amenity) => (
              <span
                key={amenity}
                className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground/80"
              >
                {amenity}
              </span>
            ))}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm leading-5 text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-600 dark:text-amber-400" />
            <p>{place.caveat}</p>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={place.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98]"
            >
              <Info className="h-4 w-4" />
              Source: {place.sourceLabel}
            </a>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <a
                href={place.detailsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-all hover:border-primary/40 hover:bg-muted active:scale-[0.97]"
              >
                {place.detailsLabel}
                <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={place.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.97]"
              >
                Directions
                <MapPin className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
