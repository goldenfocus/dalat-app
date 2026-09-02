import type {
  ActivityMediaCandidate,
  ActivityCuratedMediaItem,
  ActivitySource,
  ExtractedActivity,
} from "./types";

export interface ProjectedActivityMedia {
  url: string;
  gallery: string[];
  sourceUrl: string;
  attribution: string;
  role: ActivityMediaCandidate["role"];
  policy: string;
  altText?: string;
  caption?: string;
  provenance?: ActivityCuratedMediaItem["provenance"];
  items?: ActivityCuratedMediaItem[];
}

function safeHttpsUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function relatedHostname(candidate: URL, official: URL): boolean {
  return (
    candidate.hostname === official.hostname ||
    candidate.hostname.endsWith(`.${official.hostname}`) ||
    official.hostname.endsWith(`.${candidate.hostname}`)
  );
}

export function sourceAllowsOfficialMedia(source: ActivitySource): boolean {
  return (
    source.metadata?.media_reuse_allowed === true &&
    source.metadata?.media_policy !== "reference_only"
  );
}

/**
 * Select promotional media that is advertised by the canonical first-party
 * source itself. This never broadens discovery to arbitrary page images or
 * third-party hosts.
 */
export function projectedActivityMedia(
  source: ActivitySource,
  activity: ExtractedActivity,
): ProjectedActivityMedia | null {
  if (activity.curatedMedia) {
    const { hero, promo } = activity.curatedMedia;
    return {
      url: hero.url,
      gallery: promo.map((item) => item.url),
      sourceUrl: hero.sourceUrl,
      attribution:
        hero.provenance === "ai_generated"
          ? "AI-generated illustrative image by DaLat.app"
          : "Owner-authorized event image",
      role: "primary",
      policy: hero.provenance,
      altText: hero.altText,
      caption: hero.caption,
      provenance: hero.provenance,
      items: [hero, ...promo],
    };
  }
  if (!sourceAllowsOfficialMedia(source)) return null;

  const canonical = safeHttpsUrl(source.canonical_url);
  const activitySource = safeHttpsUrl(activity.sourceUrl);
  if (!canonical || !activitySource) return null;

  const valid = (activity.mediaCandidates ?? []).filter((candidate) => {
    const image = safeHttpsUrl(candidate.url);
    const evidenceSource = safeHttpsUrl(candidate.sourceUrl);
    return (
      image !== null &&
      evidenceSource !== null &&
      relatedHostname(image, canonical) &&
      relatedHostname(evidenceSource, canonical) &&
      evidenceSource.origin === activitySource.origin
    );
  });
  if (valid.length === 0) return null;

  const primary =
    valid.find((candidate) => candidate.role === "primary") ?? valid[0];
  const gallery = [...new Set(valid.map((candidate) => candidate.url))].slice(
    0,
    4,
  );
  const attribution =
    typeof source.metadata?.attribution_text === "string" &&
    source.metadata.attribution_text.trim()
      ? source.metadata.attribution_text.trim()
      : source.name;
  const policy =
    typeof source.metadata?.media_policy === "string"
      ? source.metadata.media_policy
      : "official_source_embed";

  return {
    url: primary.url,
    gallery,
    sourceUrl: primary.sourceUrl,
    attribution,
    role: primary.role,
    policy,
  };
}

export function isActivityFactArt(url: unknown): url is string {
  return (
    typeof url === "string" && url.startsWith("https://dalat.app/activity-art/")
  );
}

export function activityProjectionImage(options: {
  currentUrl: string | null | undefined;
  currentMetadata: Record<string, unknown> | null | undefined;
  media: ProjectedActivityMedia | null;
  mediaAllowed: boolean;
}): string | null {
  const { currentUrl, currentMetadata, media, mediaAllowed } = options;
  const previousOfficialUrl = currentMetadata?.activity_media_url;
  const sourceControlled =
    typeof previousOfficialUrl === "string" &&
    previousOfficialUrl === currentUrl;

  if (media) {
    if (!currentUrl || isActivityFactArt(currentUrl) || sourceControlled) {
      return media.url;
    }
    return currentUrl;
  }

  // Preserve the last-good official image during a transient extraction miss.
  if (mediaAllowed && sourceControlled && currentUrl) return currentUrl;

  // A source-level policy revocation immediately removes source-controlled
  // media, while organizer-uploaded custom images remain untouched.
  if (!currentUrl || isActivityFactArt(currentUrl) || sourceControlled) {
    return null;
  }
  return currentUrl;
}

export function activityMediaMetadata(
  media: ProjectedActivityMedia | null,
): Record<string, unknown> {
  if (!media) return {};
  return {
    activity_media_url: media.url,
    activity_media_gallery: media.gallery,
    activity_media_source_url: media.sourceUrl,
    activity_media_attribution: media.attribution,
    activity_media_role: media.role,
    activity_media_policy: media.policy,
    ...(media.altText ? { activity_media_alt: media.altText } : {}),
    ...(media.caption ? { activity_media_caption: media.caption } : {}),
    ...(media.provenance
      ? { activity_media_provenance: media.provenance }
      : {}),
    ...(media.items ? { activity_media_items: media.items } : {}),
  };
}
