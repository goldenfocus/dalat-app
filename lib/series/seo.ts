import type { Metadata } from "next";
import { activityFactArtUrl } from "@/lib/activity-graph/fact-art";
import { buildSocialCardImageUrl } from "@/lib/events/share-preview";
import { buildAlternates, localeUrl } from "@/lib/metadata";
import type { EventSeries, Locale } from "@/lib/types";

const DEFAULT_OG_IMAGE = "https://dalat.app/og-image.png?v=2";

type SeriesSeoInput = Pick<
  EventSeries,
  "slug" | "title" | "image_url" | "source_platform"
>;

export function seriesSocialImageUrl(series: SeriesSeoInput): string {
  if (series.image_url) {
    return buildSocialCardImageUrl(series.image_url);
  }

  if (series.source_platform === "activity-graph") {
    return buildSocialCardImageUrl(activityFactArtUrl("series", series.slug));
  }

  return DEFAULT_OG_IMAGE;
}

/** Build complete, locale-specific metadata for a recurring activity page. */
export function buildEventSeriesMetadata(input: {
  series: SeriesSeoInput;
  locale: Locale;
  description: string;
}): Metadata {
  const { series, locale, description } = input;
  const canonicalUrl = localeUrl(locale, `/series/${series.slug}`);
  const imageUrl = seriesSocialImageUrl(series);

  return {
    title: `${series.title} | ĐàLạt.app`,
    description,
    alternates: buildAlternates(locale, `/series/${series.slug}`),
    openGraph: {
      title: series.title,
      description,
      type: "website",
      url: canonicalUrl,
      siteName: "ĐàLạt.app",
      locale,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          type: imageUrl === DEFAULT_OG_IMAGE ? "image/png" : "image/jpeg",
          alt: series.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: series.title,
      description,
      images: [imageUrl],
    },
  };
}
