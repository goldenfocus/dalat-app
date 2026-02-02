"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Share2, Check, Link } from "lucide-react";

interface SharePageButtonProps {
  /** Optional custom URL to share (defaults to current page) */
  url?: string;
  /** Optional title for native share dialog */
  title?: string;
  /** Show label text alongside icon */
  showLabel?: boolean;
  className?: string;
}

/**
 * Simple share button that uses native share or copies URL to clipboard.
 * Designed for header bars with proper 44px touch target.
 */
export function SharePageButton({
  url,
  title,
  showLabel = false,
  className = "",
}: SharePageButtonProps) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [shareUrl, setShareUrl] = useState(url || "");

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
    if (!url && typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, [url]);

  const handleShare = async () => {
    const urlToShare = url || shareUrl;

    // Try native share first (mobile)
    if (canShare) {
      try {
        await navigator.share({
          title: title || document.title,
          url: urlToShare,
        });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // Fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(urlToShare);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleShare}
      className={`-mr-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg ${className}`}
      aria-label={copied ? t("copied") : t("share")}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-green-500" />
          {showLabel && <span className="text-sm text-green-500">{t("copied")}</span>}
        </>
      ) : (
        <>
          <Link className="w-4 h-4" />
          {showLabel && <span className="text-sm">{t("share")}</span>}
        </>
      )}
    </button>
  );
}
