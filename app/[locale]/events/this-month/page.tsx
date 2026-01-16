import { redirect } from "next/navigation";
import { buildArchiveUrl } from "@/lib/events/archive-utils";

/**
 * /events/this-month redirects to the canonical archive URL
 * e.g., /events/2026/january
 *
 * This ensures:
 * - Single canonical URL per month (better for SEO/AEO/GEO)
 * - Stable, citable URLs that don't change meaning over time
 * - All link equity flows to the archive page
 */
export default function ThisMonthRedirect() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  redirect(buildArchiveUrl(currentYear, currentMonth));
}
