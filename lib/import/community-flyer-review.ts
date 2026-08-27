export const COMMUNITY_FLYER_SOURCE = "community-suggestion";
export const COMMUNITY_FLYER_TYPE = "image";

export type CommunityFlyerStatus = "pending" | "failed";

export interface CommunityFlyerReview {
  id: string;
  status: CommunityFlyerStatus;
  title: string;
  flyerUrl: string;
  createdAt: string;
  errorDetail: string | null;
}

interface QueueRow {
  id?: unknown;
  status?: unknown;
  payload?: unknown;
  created_at?: unknown;
  error_detail?: unknown;
}

function sanitizeText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

export function sanitizeCommunityFlyerUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "cdn.dalat.app" ||
      !url.pathname.startsWith("/event-media/community-suggestions/")
    ) {
      return null;
    }
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeCommunityFlyerRow(row: QueueRow): CommunityFlyerReview | null {
  if (typeof row.id !== "string" || !["pending", "failed"].includes(String(row.status))) {
    return null;
  }
  const payload = row.payload && typeof row.payload === "object"
    ? row.payload as Record<string, unknown>
    : {};
  const flyerUrl = sanitizeCommunityFlyerUrl(payload.flyerUrl);
  if (!flyerUrl) return null;

  return {
    id: row.id,
    status: row.status as CommunityFlyerStatus,
    title: sanitizeText(payload.title, 160) || "Community event flyer",
    flyerUrl,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    errorDetail: sanitizeText(row.error_detail, 240) || null,
  };
}
