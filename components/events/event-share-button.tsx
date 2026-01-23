"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EventShareButtonProps {
  eventSlug: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
}

export function EventShareButton({
  eventSlug,
  eventTitle,
  eventDescription,
  startsAt,
}: EventShareButtonProps) {
  const t = useTranslations("invite");
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  // Construct event URL from slug (client-side)
  const eventUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${eventSlug}`;

  // Format date for share message using user's locale
  const eventDate = new Date(startsAt);
  const formattedDate = eventDate.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  // Truncate description
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

  const handleShare = async () => {
    if (canShare) {
      try {
        await navigator.share({
          title: eventTitle,
          text: `🎉 ${t("youreInvited")}\n\n${eventTitle}\n📅 ${formattedDate}${descriptionSnippet ? `\n\n${descriptionSnippet}` : ""}`,
          url: eventUrl,
        });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // Fall through to copy
      }
    }

    // Fallback: copy full share message to clipboard
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleShare}
      className="h-9 w-9"
      title={copied ? t("copied") : t("share")}
    >
      {copied ? (
        <Check className="h-5 w-5 text-green-500" />
      ) : (
        <Share2 className="h-5 w-5" />
      )}
      <span className="sr-only">Share event</span>
    </Button>
  );
}
