"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareButtonsProps {
  eventUrl: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
  imageUrl?: string | null;
}

export function ShareButtons({ eventUrl, eventTitle, eventDescription, startsAt, imageUrl }: ShareButtonsProps) {
  const t = useTranslations("invite");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // Check if Web Share API is available (client-side only)
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  // Format date for share message using user's locale
  const eventDate = new Date(startsAt);
  const formattedDate = eventDate.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Truncate description to ~100 chars at word boundary
  const truncateDescription = (desc: string | null, maxLength = 100) => {
    if (!desc) return null;
    if (desc.length <= maxLength) return desc;
    const truncated = desc.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    return lastSpace > 0 ? truncated.slice(0, lastSpace) + "..." : truncated + "...";
  };

  const descriptionSnippet = truncateDescription(eventDescription);

  // Build share message in user's language
  const shareMessage = `${eventUrl}\n🎉 ${t("youreInvited")}\n\n${eventTitle}\n📅 ${formattedDate}${descriptionSnippet ? `\n\n${descriptionSnippet}` : ""}`;

  // Fetch image as blob for sharing
  const fetchImageBlob = async (): Promise<Blob | null> => {
    if (!imageUrl) return null;
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) return null;
      return await response.blob();
    } catch {
      return null;
    }
  };

  const handleNativeShare = async () => {
    try {
      // Try to share with image if available and supported
      if (imageUrl && navigator.canShare) {
        const imageBlob = await fetchImageBlob();
        if (imageBlob) {
          const file = new File([imageBlob], "event.jpg", { type: imageBlob.type });
          const shareData = {
            title: eventTitle,
            text: `🎉 ${t("youreInvited")}\n\n${eventTitle}\n📅 ${formattedDate}${descriptionSnippet ? `\n\n${descriptionSnippet}` : ""}`,
            url: eventUrl,
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
        text: `🎉 ${t("youreInvited")}\n\n${eventTitle}\n📅 ${formattedDate}${descriptionSnippet ? `\n\n${descriptionSnippet}` : ""}`,
        url: eventUrl,
      });
    } catch (err) {
      // User cancelled or share failed - that's okay
      if ((err as Error).name !== "AbortError") {
        console.error("Share failed:", err);
      }
    }
  };

  const handleCopyLink = async () => {
    try {
      // Try to copy text + image if supported
      if (imageUrl && navigator.clipboard.write) {
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
      // Last resort: try text-only
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
    <div className="flex flex-wrap gap-2">
      {/* Native Share - only shown if Web Share API is available */}
      {canShare && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleNativeShare}
          className="gap-2 flex-1 min-w-[100px]"
        >
          <Share2 className="w-4 h-4" />
          {t("share")}
        </Button>
      )}

      {/* Copy link - always available */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyLink}
        className="gap-2 flex-1 min-w-[100px]"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            {t("copied")}
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            {t("copyLink")}
          </>
        )}
      </Button>
    </div>
  );
}
