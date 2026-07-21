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

      // Default to doing nothing at all: the anchor points at a
      // Content-Disposition route, so the browser downloads it natively —
      // instant, streamed, with real progress. Buffering it into a blob first
      // is strictly slower and shows a spinner for no gain.
      //
      // The single exception is iOS on a touch device, where a plain download
      // lands in Files and the share sheet is the only route into Photos —
      // which is where someone saving a photo expects to find it. macOS
      // Safari also exposes navigator.canShare, so checking that alone would
      // (and did) drag desktop onto the slow path.
      const info = detectInAppBrowser();

      // iOS in-app browsers are a dead end, not a slow path. A WKWebView can
      // only save a file if the host app implements WKDownloadDelegate, and
      // Zalo doesn't — it ignores Content-Disposition and renders the image
      // inline, so navigating just strands the user on a bare image page with
      // no save option and loses their place in the gallery. Nothing we send
      // over the wire changes that. Keep them here and name the one action
      // that works. (Android WebViews often do handle downloads, so they
      // still fall through to the normal navigation below.)
      if (info.isInApp && info.isIOS) {
        e.preventDefault();
        triggerHaptic("selection");

        const absolute = new URL(
          momentDownloadHref(moment.id),
          window.location.origin
        ).toString();

        // `x-safari-https://` is undocumented but widely honoured by iOS
        // in-app browsers: it hands the URL to Safari, which HAS a download
        // stack. That turns three taps into one. If Zalo doesn't handle the
        // scheme, nothing happens at all — no error to catch — so we always
        // queue the fallback below rather than trusting it.
        window.location.href = `x-safari-${absolute}`;

        // Fallback: the inline image page. Not a save, but it renders the
        // photo and exposes Zalo's own "Open in Safari", which is where this
        // was before. Never leave the tap doing nothing.
        window.setTimeout(() => {
          window.location.href = momentDownloadHref(moment.id);
        }, 1500);
        return;
      }

      const isTouch =
        typeof window !== "undefined" &&
        window.matchMedia?.("(pointer: coarse)").matches;
      const shareIsBetter =
        isTouch &&
        info.isIOS &&
        !info.isInApp &&
        typeof navigator !== "undefined" &&
        !!navigator.canShare;

      if (!shareIsBetter) return; // let the browser have it

      // preventDefault must come before the busy guard. Returning early
      // without it lets a second tap follow the href and navigate away
      // mid-flight, killing the save already in progress.
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      triggerHaptic("selection");

      try {
        const outcome = await downloadMoment(moment, { preferShare: true });

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
export function InAppBrowserDownloadHint({
  className = "",
  tone = "muted",
}: {
  className?: string;
  /** "muted" on light surfaces, "overlay" on fullscreen dark chrome. */
  tone?: "muted" | "overlay";
}) {
  const t = useTranslations("moments");
  const [info, setInfo] = useState<{ isInApp: boolean; isIOS: boolean }>({
    isInApp: false,
    isIOS: false,
  });

  useEffect(() => {
    const detected = detectInAppBrowser();
    setInfo({ isInApp: detected.isInApp, isIOS: detected.isIOS });
  }, []);

  if (!info.isInApp) return null;

  return (
    <p
      className={`text-[11px] leading-snug ${
        tone === "overlay" ? "text-white/50" : "text-muted-foreground/70"
      } ${className}`}
    >
      <span aria-hidden="true">* </span>
      {info.isIOS ? t("download.inAppNoteIos") : t("download.inAppNote")}
    </p>
  );
}
