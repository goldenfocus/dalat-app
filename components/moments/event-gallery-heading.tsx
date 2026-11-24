"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { OriginalText } from "@/components/ui/original-text";
import { markdownToPlainText } from "@/lib/blog/strip-markdown";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { MomentForCard } from "./moment-card";

interface EventGalleryHeadingProps {
  slug: string;
  title: string;
  translatedTitle?: string;
  description?: string | null;
  translatedDescription?: string;
  imageUrl: string | null;
  fallbackPhoto?: Pick<MomentForCard, "media_url" | "thumbnail_url">;
  date: string;
  locationName: string | null;
  dateLabel: string;
  heading?: "h1" | "h2";
}

export function EventGalleryHeading({
  slug,
  title,
  translatedTitle,
  description,
  translatedDescription,
  imageUrl,
  fallbackPhoto,
  date,
  locationName,
  dateLabel,
  heading: Heading = "h2",
}: EventGalleryHeadingProps) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const poster = [imageUrl, fallbackPhoto?.thumbnail_url, fallbackPhoto?.media_url]
    .find((url): url is string => Boolean(url && !failedImages.includes(url)));
  const displayTitle = translatedTitle || title;
  const displayDescription = markdownToPlainText(translatedDescription || description || "");
  const original = [
    displayTitle !== title ? title : null,
    translatedDescription && translatedDescription !== description ? description : null,
  ].filter(Boolean).join("\n\n");

  return (
    <header className="min-w-0">
      <Link
        href={`/events/${slug}`}
        className="group flex min-h-11 items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {poster && (
          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-16">
            <Image
              key={poster}
              src={poster}
              alt=""
              fill
              sizes="64px"
              unoptimized
              className="object-cover"
              onError={() => setFailedImages((failed) => [...failed, poster])}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Heading className="break-words font-semibold leading-snug group-hover:underline">
            {displayTitle}
          </Heading>
          <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
            <time dateTime={date}>{dateLabel}</time>
            {locationName && ` · ${decodeUnicodeEscapes(locationName)}`}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
      {(displayDescription || original) && (
        <div className={original ? "relative mt-2 min-h-11" : "mt-2"}>
          {displayDescription && (
            <p className={`line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground ${original ? "pr-12" : ""}`}>
              {displayDescription}
            </p>
          )}
          {original && <OriginalText text={original} iconOnly />}
        </div>
      )}
    </header>
  );
}
