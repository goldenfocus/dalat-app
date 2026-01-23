"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareButtonsProps {
  eventUrl: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
}

export function ShareButtons({ eventUrl, eventTitle, eventDescription, startsAt }: ShareButtonsProps) {
  const t = useTranslations("invite");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // Check if Web Share API is available (client-side only)
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  // Format date for share message
  const eventDate = new Date(startsAt);
  const formattedDate = eventDate.toLocaleDateString("en-US", {
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

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: eventTitle,
        text: `🎉 You're invited!\n\n${eventTitle}\n📅 ${formattedDate}${descriptionSnippet ? `\n\n${descriptionSnippet}` : ""}`,
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
      await navigator.clipboard.writeText(eventUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
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
