import { coverPalette, type CoverPalette } from "@/lib/blog/cover-palette";
import { formatInDaLat } from "@/lib/timezone";

export const ACTIVITY_FACT_ART_SIZE = {
  width: 1200,
  height: 1500,
} as const;

export type ActivityFactArtKind = "event" | "series";

export interface ActivityFactArtInput {
  kind: ActivityFactArtKind;
  slug: string;
  title: string;
  startsAt?: string | null;
  scheduleText?: string | null;
  venue?: string | null;
}

export interface ActivityFactArtModel {
  kind: ActivityFactArtKind;
  eyebrow: string;
  title: string;
  date: string;
  venue: string;
  palette: CoverPalette;
  titleFontSize: number;
}

const SITE_URL = "https://dalat.app";
const FACT_ART_SEGMENTS: Record<ActivityFactArtKind, string> = {
  event: "events",
  series: "series",
};

/**
 * Public, extension-bearing image URLs bypass locale middleware and are safe to
 * store directly in image_url. The slug is encoded as one path segment.
 */
export function activityFactArtPath(
  kind: ActivityFactArtKind,
  slug: string,
): string {
  const normalizedSlug = slug.trim();
  if (
    !normalizedSlug ||
    normalizedSlug.includes("/") ||
    normalizedSlug.includes("\\")
  ) {
    throw new Error(
      "Activity fact-art requires a single non-empty slug segment",
    );
  }

  return `/activity-art/${FACT_ART_SEGMENTS[kind]}/${encodeURIComponent(normalizedSlug)}.png`;
}

export function activityFactArtUrl(
  kind: ActivityFactArtKind,
  slug: string,
  siteUrl = SITE_URL,
): string {
  return new URL(activityFactArtPath(kind, slug), siteUrl).toString();
}

export function parseActivityFactArtPath(
  kindSegment: string,
  fileSegment: string,
): { kind: ActivityFactArtKind; slug: string } | null {
  const kind = Object.entries(FACT_ART_SEGMENTS).find(
    ([, segment]) => segment === kindSegment,
  )?.[0] as ActivityFactArtKind | undefined;

  if (!kind || !fileSegment.toLowerCase().endsWith(".png")) return null;

  const slug = fileSegment.slice(0, -4).trim();
  if (!slug || slug.includes("/") || slug.includes("\\")) return null;

  return { kind, slug };
}

function shortenAtWord(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const shortened = normalized.slice(0, maxLength - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  const boundary =
    lastSpace >= Math.floor(maxLength * 0.6) ? lastSpace : maxLength - 1;
  return `${shortened.slice(0, boundary).trimEnd()}…`;
}

export function formatActivityFactArtDate(startsAt?: string | null): string {
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
    return "Schedule on ĐàLạt.app";
  }

  return formatInDaLat(startsAt, "dd MMM yyyy · HH:mm");
}

/**
 * Turn verified activity facts into a bounded model for the ImageResponse.
 * There is deliberately no generated prose or third-party media here.
 */
export function buildActivityFactArtModel(
  input: ActivityFactArtInput,
): ActivityFactArtModel {
  const title = shortenAtWord(input.title || "What to do in Đà Lạt", 76);
  const venue = shortenAtWord(input.venue || "Đà Lạt, Vietnam", 62);
  const date = shortenAtWord(
    input.scheduleText || formatActivityFactArtDate(input.startsAt),
    48,
  );

  return {
    kind: input.kind,
    eyebrow: input.kind === "series" ? "RECURRING ACTIVITY" : "ĐÀ LẠT ACTIVITY",
    title,
    date,
    venue,
    palette: coverPalette(`activity-fact:${input.kind}:${input.slug}`),
    titleFontSize: title.length > 60 ? 58 : title.length > 38 ? 68 : 82,
  };
}
