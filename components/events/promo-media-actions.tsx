"use client";
import { useEffect, useRef, useState } from "react";
import { Share2, Download, Images, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { detectInAppBrowser } from "@/lib/utils/in-app-browser";
import { useShare } from "@/lib/hooks/use-share";
import { downloadBlob, type DownloadProgress } from "@/lib/download-blob";
import { isAllowedMediaDownloadUrl } from "@/lib/media-download-url";
import type { EventPromoMedia } from "@/lib/types";

export function PromoMediaActions({ item, eventSlug, compact = false }: { item: EventPromoMedia; eventSlug: string; compact?: boolean }) {
  const t = useTranslations("moments");
  const p = useTranslations("promo");
  const common = useTranslations("common");
  const { share, copied } = useShare();
  const [isIOS, setIsIOS] = useState(false);
  const [panel, setPanel] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setIsIOS(detectInAppBrowser().isIOS || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    return () => request.current?.abort();
  }, []);
  const path = item.source_moment_id ? `/events/${eventSlug}/moments/${item.source_moment_id}` : `/events/${eventSlug}/moments`;
  const href = `/api/events/${eventSlug}/promo/${item.id}/download`;
  const mobileHref = href + "?quality=mobile";
  const canSavePhotos = ["image", "video", "youtube"].includes(item.media_type);
  const canDownload = !!item.source_moment_id || (!!item.media_url && item.media_type !== "soundcloud");
  const style = "flex min-h-11 min-w-11 flex-1 items-center justify-center overflow-hidden gap-1.5 rounded-lg px-2 text-xs transition-colors hover:bg-emerald-500/10";
  const textStyle = compact ? "sr-only" : "";
  const handleDownload = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    const info = detectInAppBrowser();
    const isIOS = info.isIOS || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!canSavePhotos || (!isIOS && !info.isInApp)) {
      setNotice(t("download.albumStarted"));
      return; // Keep the normal streamed browser download.
    }
    event.preventDefault();
    setPanel(true); // Feedback is synchronous, even when the host cannot download.
    setNotice("");
    if (file || preparing || !navigator.canShare || !navigator.share) return;
    const mime = item.media_type === "image" ? "image/jpeg" : "video/mp4";
    const name = item.media_type === "image" ? "dalat.app-promo.jpg" : "dalat.app-promo.mp4";
    if (!navigator.canShare({ files: [new File([""], name, { type: mime })] })) return;
    const controller = new AbortController();
    request.current = controller;
    setPreparing(true);
    setProgress(null);
    try {
      const directUrl = item.media_url && isAllowedMediaDownloadUrl(item.media_url) ? item.media_url : mobileHref;
      const blob = await downloadBlob(directUrl, { signal: controller.signal, fallbackUrl: mobileHref, onProgress: setProgress });
      const prepared = new File([blob], name, { type: blob.type || mime });
      if (!navigator.canShare({ files: [prepared] })) throw new Error("File sharing unavailable");
      setFile(prepared);
    } catch (error) {
      if (!controller.signal.aborted) setNotice(t("download.failed"));
    } finally {
      setPreparing(false);
    }
  };
  const saveFile = async () => {
    if (!file) return;
    try {
      // A second, explicit tap preserves iOS user activation after the large fetch.
      await navigator.share({ files: [file] });
    } catch (error) {
      if ((error as Error).name !== "AbortError") setNotice(t("download.failed"));
    }
  };
  const copyDownloadLink = async () => {
    const url = new URL(isIOS ? mobileHref : href, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(p("downloadLinkCopied"));
    } catch {
      setNotice(p("downloadCopyFailed")); // The selectable URL remains visible.
    }
  };
  return <div className="space-y-2">
    <div className="flex items-center gap-1 rounded-xl border border-border/50 p-1">
      <button type="button" className={style} title={t("share")} aria-label={t("share")} onClick={() => share({title: item.title || t("moments"), url: new URL(path, window.location.origin).href})}>
        {copied ? <Check className="h-4 w-4 shrink-0" /> : <Share2 className="h-4 w-4 shrink-0" />}<span className={textStyle}>{t("share")}</span>
      </button>
      {canDownload && <a className={style} onClick={handleDownload} href={href} download title={isIOS && canSavePhotos ? p("saveFile") : t("download.label")} aria-label={isIOS && canSavePhotos ? p("saveFile") : t("download.label")}><Download className="h-4 w-4 shrink-0" /><span className={textStyle}>{isIOS && canSavePhotos ? p("saveFile") : t("download.label")}</span></a>}
      <Link className={style} href={path} title={t("viewMoments")} aria-label={t("viewMoments")}><Images className="h-4 w-4 shrink-0" /><span className={textStyle}>{t("moments")}</span></Link>
    </div>
    {panel && <div className="space-y-3 rounded-xl border border-border/50 bg-emerald-500/5 p-3 text-sm">
      <p>{p("downloadHelp")}</p>
      {preparing && <div className="space-y-2">
        <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{progress?.total ? Math.min(100, Math.floor(progress.loaded / progress.total * 100)) + "%" : t("download.albumStarted")}{progress && <span className="tabular-nums">{(progress.loaded / 1048576).toFixed(1)}{progress.total ? " / " + (progress.total / 1048576).toFixed(1) : ""} MB</span>}</p>
        <progress aria-label={t("download.label")} className="w-full accent-emerald-500" {...(progress?.total ? {value:progress.loaded,max:progress.total} : {})} />
        <button type="button" className="min-h-11 rounded-lg border px-3" onClick={() => request.current?.abort()}>{common("cancel")}</button>
      </div>}
      {file && <button type="button" onClick={saveFile} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-white"><Download className="h-4 w-4" />{p("saveFile")}</button>}
      <div className="flex flex-wrap gap-2">
        <a href={isIOS ? mobileHref : href} target="_blank" rel="noopener" className="min-h-11 rounded-lg border px-3 py-3">{p("openFile")}</a>
        <button type="button" onClick={copyDownloadLink} className="min-h-11 rounded-lg border px-3">{p("copyDownloadLink")}</button>
      </div>
      <input aria-label={p("copyDownloadLink")} readOnly value={typeof window !== "undefined" ? new URL(isIOS ? mobileHref : href, window.location.origin).href : href} onFocus={event => event.currentTarget.select()} className="w-full rounded border bg-transparent px-2 py-2 text-xs" />
    </div>}
    {notice && <p role="status" className="px-1 text-xs">{notice}</p>}
  </div>;
}
