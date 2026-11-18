"use client";
import { Share2, Download, Images, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { toast } from "sonner";
import { detectInAppBrowser } from "@/lib/utils/in-app-browser";
import { useShare } from "@/lib/hooks/use-share";
import type { EventPromoMedia } from "@/lib/types";
export function PromoMediaActions({ item, eventSlug, compact = false }: { item: EventPromoMedia; eventSlug: string; compact?: boolean }) {
  const t = useTranslations("moments"); const { share, copied, copyText } = useShare();
  const path = item.source_moment_id ? `/events/${eventSlug}/moments/${item.source_moment_id}` : `/events/${eventSlug}/moments`;
  const canDownload = !!item.source_moment_id || (!!item.media_url && item.media_type !== "soundcloud");
  const style = "flex min-h-11 min-w-11 flex-1 items-center justify-center overflow-hidden gap-1.5 rounded-lg px-2 text-xs transition-colors hover:bg-emerald-500/10";
  const textStyle = compact ? "sr-only" : "";
  const handleDownload = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    const browser = detectInAppBrowser();
    if (!browser.isInApp) return;
    event.preventDefault();
    await copyText(event.currentTarget.href);
    toast(browser.isIOS ? t("download.linkCopiedIos") : t("download.linkCopied"), {duration: 7000});
  };
  return <div className="flex items-center gap-1 rounded-xl border border-border/50 p-1">
    <button type="button" className={style} title={t("share")} aria-label={t("share")} onClick={() => share({title: item.title || t("moments"), url: new URL(path, window.location.origin).href})}>
      {copied ? <Check className="h-4 w-4 shrink-0" /> : <Share2 className="h-4 w-4 shrink-0" />}<span className={textStyle}>{t("share")}</span>
    </button>
    {canDownload && <a className={style} onClick={handleDownload} href={`/api/events/${eventSlug}/promo/${item.id}/download`} download title={t("download.label")} aria-label={t("download.label")}><Download className="h-4 w-4 shrink-0" /><span className={textStyle}>{t("download.label")}</span></a>}
    <Link className={style} href={path} title={t("viewMoments")} aria-label={t("viewMoments")}><Images className="h-4 w-4 shrink-0" /><span className={textStyle}>{t("moments")}</span></Link>
  </div>;
}
