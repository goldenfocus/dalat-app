export interface GuidePlaceCategoryLink {
  label: string;
  href: string;
}

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
  categoryLinks: GuidePlaceCategoryLink[];
  caveat: string;
  sourceUrl: string;
  sourceLabel: string;
  phone?: string;
}

interface RawGuidePlaceCardData extends Partial<GuidePlaceCardData> {
  amenities?: string[];
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

function isInternalCategoryPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\/[a-z0-9-]+$/u.test(value) &&
    !value.startsWith("//")
  );
}

function inferCategoryLinks(type: unknown): GuidePlaceCategoryLink[] {
  if (typeof type !== "string") return [];

  const normalized = type.toLocaleLowerCase("en");
  const links: GuidePlaceCategoryLink[] = [];

  if (/cowork|workspace|work room/u.test(normalized)) {
    links.push({ label: "Da Lat coworking", href: "/coworking" });
  }
  if (/café|cafe|coffee/u.test(normalized)) {
    links.push({ label: "Da Lat cafés", href: "/cafes" });
  }

  return links;
}

export function parseGuidePlaceCard(value: string): GuidePlaceCardData | null {
  try {
    const candidate = JSON.parse(value) as RawGuidePlaceCardData;
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

    const categoryLinks = candidate.categoryLinks ?? inferCategoryLinks(candidate.type);

    if (
      !Number.isInteger(candidate.position) ||
      (candidate.position || 0) < 1 ||
      requiredText.some((field) => typeof field !== "string" || !field.trim()) ||
      !isHttpUrl(candidate.detailsUrl) ||
      !isHttpUrl(candidate.mapUrl) ||
      !isHttpUrl(candidate.imageUrl) ||
      !isHttpUrl(candidate.sourceUrl) ||
      !Array.isArray(categoryLinks) ||
      categoryLinks.length === 0 ||
      categoryLinks.some(
        (link) =>
          typeof link?.label !== "string" ||
          !link.label.trim() ||
          !isInternalCategoryPath(link.href)
      )
    ) {
      return null;
    }

    return { ...candidate, categoryLinks } as GuidePlaceCardData;
  } catch {
    return null;
  }
}

export function extractGuidePlaceCards(content: string): GuidePlaceCardData[] {
  return [...content.matchAll(GUIDE_PLACE_FENCE)]
    .map((match) => parseGuidePlaceCard(match[1].trim()))
    .filter((place): place is GuidePlaceCardData => place !== null);
}
