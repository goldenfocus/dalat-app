import { extractGuidePlaceCards } from "@/lib/blog/guide-place";

export interface GuideQualityInput {
  title: string;
  storyContent: string;
}

export interface GuideQualityIssue {
  code:
    | "too_short"
    | "missing_checked_date"
    | "missing_sources"
    | "missing_entries"
    | "invalid_numbering"
    | "duplicate_entries"
    | "count_mismatch"
    | "insufficient_place_links";
  message: string;
}

const COUNTED_GUIDE_TITLE =
  /\b([2-9]|[1-9]\d)\s+(?:(?:best|top|real|great|essential|favorite|favourite|recommended|checked|documented)\s+)?(?:[\p{L}\p{M}&+/-]+\s+){0,7}(?:spots?|places?|cafes?|cafés?|restaurants?|bars?|hotels?|homestays?|trails?|hikes?|activities|attractions|things|workspaces?|coworking\s+spaces?)\b/iu;

const PLACE_GUIDE_TITLE =
  /\b(?:coworking|remote\s+work|work\s+cafes?|laptop|spots?|places?|cafes?|cafés?|restaurants?|bars?|hotels?|homestays?|trails?|hikes?|activities|attractions|workspaces?|where\s+to\s+(?:work|stay|eat|drink))\b/iu;
const NUMBERED_ENTRY_HEADING = /^#{2,4}\s+(\d{1,3})[.)]\s+(\S.+)$/gmu;
const SOURCE_HEADING = /^#{2,4}\s+sources?\b.*$/imu;
const EXTERNAL_MARKDOWN_LINK = /\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/gimu;
const CHECKED_DATE =
  /\b(?:last\s+checked|checked(?:\s+online)?|information\s+checked|reviewed|verified)\b[^\n]{0,100}\b20\d{2}\b/iu;

interface NumberedGuideEntry {
  number: number;
  label: string;
}

function extractNumberedGuideEntries(storyContent: string): NumberedGuideEntry[] {
  return [...storyContent.matchAll(NUMBERED_ENTRY_HEADING)].map((match) => ({
    number: Number(match[1]),
    label: match[2]
      .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
      .replace(/[*_`~]/gu, "")
      .trim()
      .toLocaleLowerCase("en"),
  }));
}

function isDirectionsLink(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    return (
      ((hostname === "google.com" || hostname.endsWith(".google.com")) &&
        url.pathname.startsWith("/maps")) ||
      hostname === "maps.app.goo.gl"
    );
  } catch {
    return false;
  }
}

function countUniqueEvidenceLinks(storyContent: string): number {
  const normalized = [...storyContent.matchAll(EXTERNAL_MARKDOWN_LINK)]
    .map((match) => match[1])
    .filter((url) => !isDirectionsLink(url))
    .map((url) => url.replace(/\/$/u, ""));
  return new Set(normalized).size;
}

export function extractPromisedGuideCount(title: string): number | null {
  const match = title.match(COUNTED_GUIDE_TITLE);
  return match ? Number(match[1]) : null;
}

export function countNumberedGuideEntries(storyContent: string): number {
  return extractNumberedGuideEntries(storyContent).length;
}

export function validateGuideForPublishing({
  title,
  storyContent,
}: GuideQualityInput): GuideQualityIssue[] {
  const issues: GuideQualityIssue[] = [];
  const wordCount = storyContent.trim().split(/\s+/u).filter(Boolean).length;
  const promisedCount = extractPromisedGuideCount(title);
  const numberedEntries = extractNumberedGuideEntries(storyContent);
  const guidePlaceCards = extractGuidePlaceCards(storyContent);
  const guideEntries = [
    ...numberedEntries,
    ...guidePlaceCards.map((place) => ({
      number: place.position,
      label: place.name.trim().toLocaleLowerCase("en"),
    })),
  ];
  const guideEntryCount = guideEntries.length;
  const evidenceLinks = countUniqueEvidenceLinks(storyContent);

  if (wordCount < 250) {
    issues.push({
      code: "too_short",
      message: `Guides need enough public detail to be useful (currently ${wordCount} words; minimum 250).`,
    });
  }

  if (!CHECKED_DATE.test(storyContent)) {
    issues.push({
      code: "missing_checked_date",
      message: 'Add a visible "Checked Month Day, Year" note so readers know how fresh the information is.',
    });
  }

  if (!SOURCE_HEADING.test(storyContent) || evidenceLinks === 0) {
    issues.push({
      code: "missing_sources",
      message: "Add a Sources section with links readers can use to verify the guide.",
    });
  }

  if (PLACE_GUIDE_TITLE.test(title) && guideEntryCount === 0) {
    issues.push({
      code: "missing_entries",
      message:
        "Place guides need explicit visual place cards or numbered place headings in the public article.",
    });
  }

  if (
    guideEntries.some((entry, index) => entry.number !== index + 1)
  ) {
    issues.push({
      code: "invalid_numbering",
      message: "Numbered guide entries must run once, in order, starting at 1.",
    });
  }

  if (new Set(guideEntries.map((entry) => entry.label)).size !== guideEntryCount) {
    issues.push({
      code: "duplicate_entries",
      message: "Every numbered guide entry needs a distinct place or item name.",
    });
  }

  if (promisedCount !== null && guideEntryCount !== promisedCount) {
    issues.push({
      code: "count_mismatch",
      message: `The title promises ${promisedCount} entries, but the public article has ${guideEntryCount} explicit place entries.`,
    });
  }

  if (promisedCount !== null && evidenceLinks < promisedCount) {
    issues.push({
      code: "insufficient_place_links",
      message: `The title promises ${promisedCount} entries, but the public article has only ${evidenceLinks} unique non-directions evidence links.`,
    });
  }

  return issues;
}
