import { Globe, UtensilsCrossed } from "lucide-react";
import { getTranslations } from "next-intl/server";

export function safeOfficialUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export async function OfficialVenueLinks({ website, menu, name }: { website?: string | null; menu?: string | null; name: string }) {
  const t = await getTranslations("venueHighlights");
  const websiteUrl = safeOfficialUrl(website);
  const menuUrl = safeOfficialUrl(menu);
  if (!websiteUrl && !menuUrl) return null;
  return <div className="flex flex-wrap gap-2" data-venue-official-links>
    {websiteUrl && <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted" aria-label={t("websiteFor", { venue: name })}>
      <Globe className="h-4 w-4" />{new URL(websiteUrl).hostname.replace(/^www\./, "")}
    </a>}
    {menuUrl && <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted">
      <UtensilsCrossed className="h-4 w-4" />{t("officialMenu")}
    </a>}
  </div>;
}
