"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Share2, Check } from "lucide-react";
import { format } from "date-fns";
import { triggerHaptic } from "@/lib/haptics";

interface AlbumShareButtonProps {
  eventSlug: string;
  eventTitle: string;
  eventDate: string;
  eventImageUrl: string | null;
  locationName: string | null;
  momentCount: number;
}

/**
 * Share button for moment albums with two actions:
 * 1. Native share (triggers share sheet on mobile)
 * 2. Copy to clipboard (copies link + image + metadata)
 */
export function AlbumShareButton({
  eventSlug,
  eventTitle,
  eventDate,
  eventImageUrl,
  locationName,
  momentCount,
}: AlbumShareButtonProps) {
  const t = useTranslations("common");
  const tm = useTranslations("moments");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  // Construct moments URL for this event
  const momentsUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${eventSlug}/moments`;

  // Format date for share message
  const formattedDate = format(new Date(eventDate), "MMM d, yyyy");

  // Build share message
  const shareText = `${eventTitle}\n${formattedDate}${locationName ? ` - ${locationName}` : ""}\n${momentCount} ${tm("moments").toLowerCase()}`;

  // Fetch image as blob for sharing
  const fetchImageBlob = async (): Promise<Blob | null> => {
    if (!eventImageUrl) return null;
    try {
      const response = await fetch(eventImageUrl);
      if (!response.ok) return null;
      return await response.blob();
    } catch {
      return null;
    }
  };

  const handleNativeShare = async () => {
    triggerHaptic("selection");

    if (canShare) {
      try {
        // Try to share with image if available and supported
        if (eventImageUrl && navigator.canShare) {
          const imageBlob = await fetchImageBlob();
          if (imageBlob) {
            const file = new File([imageBlob], "album.jpg", { type: imageBlob.type });
            const shareData = {
              title: eventTitle,
              text: shareText,
              url: momentsUrl,
              files: [file],
            };
            if (navigator.canShare(shareData)) {
              await navigator.share(shareData);
              return;
            }
          }
        }
        // Fallback: share without image
        await navigator.share({
          title: eventTitle,
          text: shareText,
          url: momentsUrl,
        });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // Fall through to copy
        await handleCopyToClipboard();
      }
    } else {
      // No native share, fall back to copy
      await handleCopyToClipboard();
    }
  };

  const handleCopyToClipboard = async () => {
    triggerHaptic("selection");

    const shareMessage = `${momentsUrl}\n\n${shareText}`;

    try {
      // Try to copy both text and image if supported
      if (eventImageUrl && navigator.clipboard.write) {
        const imageBlob = await fetchImageBlob();
        if (imageBlob) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/plain": new Blob([shareMessage], { type: "text/plain" }),
              [imageBlob.type]: imageBlob,
            }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          return;
        }
      }
      // Fallback: copy text only
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      // Last resort: try text-only copy
      try {
        await navigator.clipboard.writeText(shareMessage);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        console.error("Text copy also failed");
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleNativeShare}
      className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 active:scale-95 transition-all touch-manipulation"
      aria-label={copied ? t("copied") : t("share")}
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <Share2 className="w-4 h-4" />
      )}
    </button>
  );
}
