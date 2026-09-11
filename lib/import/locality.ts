import { isDalatRelated } from "@/lib/news/base-scraper";

/**
 * Heuristic Đà Lạt / Lâm Đồng locality check reused from news ingest.
 * Never invents a venue — only scores the facts the caller already stored.
 */
export function eventLooksLocalToDalat(
  ...parts: Array<string | null | undefined>
): boolean {
  const text = parts.filter((part) => typeof part === "string" && part.trim()).join(" ");
  if (!text) return false;
  return isDalatRelated(text, "");
}
