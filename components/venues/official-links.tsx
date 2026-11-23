import { Globe, UtensilsCrossed } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { safeVenueUrl, splitVenueLinks } from "@/lib/venues/social-links";
import { TikTokIcon } from "./tiktok-icon";

export function safeOfficialUrl(value: string | null | undefined) {
  return safeVenueUrl(value)?.href ?? null;
}

export async function OfficialVenueLinks({ website, tiktok, menu, name, layout = "inline", websiteLabel }: {
  website?: string | null;
  menu?: string | null;
  tiktok?: string | null;
  name: string;
  layout?: "inline" | "grid";
  websiteLabel?: string;
}) {
  const { website: websiteUrl, tiktok: tiktokLink } = splitVenueLinks(website, tiktok);
  const menuUrl = safeOfficialUrl(menu);
  if (!websiteUrl && !menuUrl && !tiktokLink) return null;
  const t = await getTranslations("venueHighlights");
  const grid = layout === "grid";
  const linkClassName = grid
    ? "flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-center text-sm hover:bg-muted"
    : "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted";
  return <div className={grid ? `grid gap-2 ${websiteUrl && menuUrl ? "grid-cols-2" : "grid-cols-1"}` : "flex flex-wrap gap-2"} data-venue-official-links>
    {websiteUrl && <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className={linkClassName} aria-label={t("websiteFor", { venue: name })}>
      <Globe className="h-4 w-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{websiteLabel || new URL(websiteUrl).hostname.replace(/^www\./, "")}</span>
    </a>}
    {tiktokLink && <a href={tiktokLink.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      <TikTokIcon className="h-4 w-4 shrink-0" /><span>TikTok</span>
    </a>}
    {menuUrl && <a href={menuUrl} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      <UtensilsCrossed className="h-4 w-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{t("officialMenu")}</span>
    </a>}
  </div>;
}
