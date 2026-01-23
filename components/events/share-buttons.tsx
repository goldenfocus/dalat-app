"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, MessageCircle } from "lucide-react";
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

  const shareMessage = [
    "🎉 You're invited!",
    "",
    eventTitle,
    `📅 ${formattedDate}`,
    descriptionSnippet ? "" : null,
    descriptionSnippet,
    "",
    `👉 ${eventUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const encodedMessage = encodeURIComponent(shareMessage);
  const encodedUrl = encodeURIComponent(eventUrl);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(eventUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
  };

  const handleZalo = () => {
    // Zalo uses share_url parameter
    window.open(`https://zalo.me/share?url=${encodedUrl}`, "_blank");
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* WhatsApp */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleWhatsApp}
        className="gap-2 flex-1 min-w-[100px]"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        WhatsApp
      </Button>

      {/* Zalo */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleZalo}
        className="gap-2 flex-1 min-w-[100px]"
      >
        <MessageCircle className="w-4 h-4" />
        Zalo
      </Button>

      {/* Copy link */}
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
