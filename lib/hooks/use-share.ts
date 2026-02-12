"use client";

import { useState, useEffect, useCallback } from "react";
import { triggerHaptic } from "@/lib/haptics";

interface ShareOptions {
  title: string;
  text?: string;
  url: string;
}

/**
 * Shared hook for Web Share API + clipboard fallback.
 *
 * We intentionally do NOT share image files via navigator.share().
 * On Android, passing `files` causes apps (WhatsApp, Telegram, etc.)
 * to treat the share as an "image share" — the URL gets buried or
 * dropped entirely. Instead, we share text + url only. The receiving
 * app fetches the OG image from the URL's meta tags automatically,
 * giving a proper link preview card with the image.
 */
export function useShare() {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const showCopied = useCallback(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  /**
   * Copy text to clipboard with visual feedback.
   */
  const copyText = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showCopied();
      } catch {
        // Fallback for restricted contexts (e.g. in-app browsers)
        try {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
          showCopied();
        } catch {
          console.error("Copy failed");
        }
      }
    },
    [showCopied],
  );

  /**
   * Share via native Web Share API (text + url only).
   * Falls back to clipboard copy if unavailable or on error.
   */
  const share = useCallback(
    async ({ title, text, url }: ShareOptions) => {
      triggerHaptic("selection");

      if (canShare) {
        try {
          await navigator.share({
            title,
            ...(text && { text }),
            url,
          });
          return;
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          // Fall through to clipboard
        }
      }

      // Clipboard fallback
      const copyContent = text ? `${url}\n\n${text}` : url;
      await copyText(copyContent);
    },
    [canShare, copyText],
  );

  return { share, copyText, copied, canShare };
}
