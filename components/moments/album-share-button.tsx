"use client";

import { useTranslations, useLocale } from "next-intl";
import { Share2, Check } from "lucide-react";
import { format } from "date-fns";
import { useShare } from "@/lib/hooks/use-share";

interface AlbumShareButtonProps {
  eventSlug: string;
  eventTitle: string;
  eventDate: string;
  eventImageUrl: string | null;
  locationName: string | null;
  momentCount: number;
}

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
  const { share, copied } = useShare();

  const momentsUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${eventSlug}/moments`;
  const formattedDate = format(new Date(eventDate), "MMM d, yyyy");
  const shareText = `${eventTitle}\n${formattedDate}${locationName ? ` - ${locationName}` : ""}\n${momentCount} ${tm("moments").toLowerCase()}`;

  const handleShare = () =>
    share({
      title: eventTitle,
      text: shareText,
      url: momentsUrl,
      imageUrl: eventImageUrl,
    });

  return (
    <button
      type="button"
      onClick={handleShare}
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
