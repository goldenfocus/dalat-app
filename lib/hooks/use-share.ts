"use client";

import { useState, useEffect, useCallback } from "react";
import { triggerHaptic } from "@/lib/haptics";

interface ShareOptions {
  title: string;
  text?: string;
  url: string;
  imageUrl?: string | null;
}

async function fetchImageBlob(imageUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/**
 * Shared hook for Web Share API + clipboard fallback.
 *
 * Fixes a known Android bug: when navigator.share() is called with files,
 * many Android apps drop the `url` field. We embed the URL in the `text`
 * so the link is always included regardless of how the receiving app
 * handles share data.
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
   * Share via native Web Share API with optional image.
   * Falls back to clipboard copy if unavailable or on error.
   */
  const share = useCallback(
    async ({ title, text, url, imageUrl }: ShareOptions) => {
      triggerHaptic("selection");

      if (canShare) {
        try {
          // Try sharing with image first
          if (imageUrl && navigator.canShare) {
            const imageBlob = await fetchImageBlob(imageUrl);
            if (imageBlob) {
              const file = new File([imageBlob], "event.jpg", {
                type: imageBlob.type,
              });
              // Android fix: embed URL in text because many Android apps
              // ignore the `url` field when files are present.
              const shareData = {
                title,
                text: text ? `${text}\n\n${url}` : url,
                url,
                files: [file],
              };
              if (navigator.canShare(shareData)) {
                await navigator.share(shareData);
                return;
              }
            }
          }
          // Share without image
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
