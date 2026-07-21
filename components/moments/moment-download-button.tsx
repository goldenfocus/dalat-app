"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, Loader2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  downloadMoment,
  momentDownloadHref,
  albumDownloadHref,
  type DownloadableMoment,
} from "@/lib/moments/download";
import { detectInAppBrowser } from "@/lib/utils/in-app-browser";
import { triggerHaptic } from "@/lib/haptics";

interface MomentDownloadButtonProps {
  moment: DownloadableMoment;
  /** Dark chrome (lightbox/immersive) vs light surfaces. */
  variant?: "dark" | "light";
  className?: string;
  /** Icon sizing — the immersive rail runs larger than the lightbox bar. */
  iconClassName?: string;
}

/**
 * Download control for a single moment.
 *
 * Rendered as a real anchor to the same-origin attachment route and enhanced
 * with JS on click. If the enhanced path throws — or never runs — the browser
 * still follows the href, so tapping always does something. That's the whole
 * point: the bug this fixes was a tap that silently did nothing.
 */
export function MomentDownloadButton({
  moment,
  variant = "dark",
  className = "",
  iconClassName = "w-5 h-5",
}: MomentDownloadButtonProps) {
  const t = useTranslations("moments");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [inApp, setInApp] = useState(false);

  // Detect after mount — userAgent isn't available during SSR and we don't
  // want the hint baked into a cached HTML response.
  useEffect(() => {
    setInApp(detectInAppBrowser().isInApp);
  }, []);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      // preventDefault must come before the busy guard. Returning early
      // without it lets a second tap follow the href and navigate away
      // mid-flight, killing the save already in progress.
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      triggerHaptic("selection");

      try {
        const outcome = await downloadMoment(moment, {
          preferShare: typeof navigator !== "undefined" && !!navigator.canShare,
        });

        if (outcome === "saved") {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
          toast.success(t("download.saved"));
          triggerHaptic("success");
        } else if (outcome === "shared") {
          triggerHaptic("success");
        }
        // "navigated" — the browser is handling it; any toast would be a lie.
      } catch (err) {
        console.error("[moment-download] failed", err);
        toast.error(t("download.failed"));
        triggerHaptic("error");
      } finally {
        setBusy(false);
      }
    },
    [moment, busy, t]
  );

  if (!moment.media_url) return null;

  const base =
    variant === "dark"
      ? "bg-white/10 hover:bg-white/20 text-white"
      : "bg-black/5 hover:bg-black/10 text-foreground";

  return (
    <a
      href={momentDownloadHref(moment.id)}
      onClick={handleClick}
      download
      className={`p-2 rounded-full active:scale-95 transition-all ${base} ${className}`}
      aria-label={t("download.label")}
      title={inApp ? t("download.inAppHint") : t("download.label")}
    >
      {busy ? (
        <Loader2 className={`${iconClassName} animate-spin`} />
      ) : done ? (
        <Check className={`${iconClassName} text-green-400`} />
      ) : (
        <Download className={iconClassName} />
      )}
    </a>
  );
}

interface AlbumDownloadButtonProps {
  eventSlug: string;
  /** Photo count, shown inline — doubles as a "there are that many?" nudge. */
  count?: number;
}

/**
 * Whole-album download.
 *
 * Deliberately a plain anchor with no JS: the server streams the zip with
 * Content-Disposition, so the browser owns the entire transfer. That means it
 * survives navigation, shows native download progress, and works in any
 * browser that can download at all — no blob, no memory ceiling, no CORS.
 */
export function AlbumDownloadButton({ eventSlug, count }: AlbumDownloadButtonProps) {
  const t = useTranslations("moments");
  const [started, setStarted] = useState(false);

  return (
    <a
      href={albumDownloadHref(eventSlug)}
      onClick={() => {
        // No preventDefault — the browser handles the download. We only nudge,
        // because a large zip takes a few seconds before the browser reacts.
        setStarted(true);
        triggerHaptic("selection");
        // Plain toast, not success — we're handing off to the browser and
        // won't learn whether the transfer actually completed. A green tick
        // here would be a claim we can't back up.
        toast(t("download.albumStarted"));
        setTimeout(() => setStarted(false), 4000);
      }}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted active:scale-95"
    >
      {started ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      {count ? t("download.albumWithCount", { count }) : t("download.album")}
    </a>
  );
}

/**
 * One-line nudge for WebViews. Shown proactively rather than after a failure,
 * because a WebView that can't save gives us no error to react to.
 */
export function InAppBrowserDownloadHint({ className = "" }: { className?: string }) {
  const t = useTranslations("moments");
  const [info, setInfo] = useState<{ isInApp: boolean; name: string | null }>({
    isInApp: false,
    name: null,
  });

  useEffect(() => {
    const detected = detectInAppBrowser();
    setInfo({ isInApp: detected.isInApp, name: detected.name });
  }, []);

  if (!info.isInApp) return null;

  return (
    <p className={`text-xs text-muted-foreground text-center ${className}`}>
      {t("download.inAppHint")}
    </p>
  );
}
