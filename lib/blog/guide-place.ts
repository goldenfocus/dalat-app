export interface GuidePlaceCardData {
  position: number;
  name: string;
  type: string;
  description: string;
  address: string;
  hours: string;
  detailsUrl: string;
  detailsLabel: string;
  mapUrl: string;
  imageUrl: string;
  imageAlt: string;
  imageCredit: string;
  amenities: string[];
  caveat: string;
  sourceUrl: string;
  sourceLabel: string;
  phone?: string;
}

const GUIDE_PLACE_FENCE =
  /(?:```|~~~)guide-place\s*\n([\s\S]*?)\n(?:```|~~~)/gmu;

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseGuidePlaceCard(value: string): GuidePlaceCardData | null {
  try {
    const candidate = JSON.parse(value) as Partial<GuidePlaceCardData>;
    const requiredText = [
      candidate.name,
      candidate.type,
      candidate.description,
      candidate.address,
      candidate.hours,
      candidate.detailsLabel,
      candidate.imageAlt,
      candidate.imageCredit,
      candidate.caveat,
      candidate.sourceLabel,
    ];

    if (
      !Number.isInteger(candidate.position) ||
      (candidate.position || 0) < 1 ||
      requiredText.some((field) => typeof field !== "string" || !field.trim()) ||
      !isHttpUrl(candidate.detailsUrl) ||
      !isHttpUrl(candidate.mapUrl) ||
      !isHttpUrl(candidate.imageUrl) ||
      !isHttpUrl(candidate.sourceUrl) ||
      !Array.isArray(candidate.amenities) ||
      candidate.amenities.length === 0 ||
      candidate.amenities.some(
        (amenity) => typeof amenity !== "string" || !amenity.trim()
      )
    ) {
      return null;
    }

    return candidate as GuidePlaceCardData;
  } catch {
    return null;
  }
}

export function extractGuidePlaceCards(content: string): GuidePlaceCardData[] {
  return [...content.matchAll(GUIDE_PLACE_FENCE)]
    .map((match) => parseGuidePlaceCard(match[1].trim()))
    .filter((place): place is GuidePlaceCardData => place !== null);
}
