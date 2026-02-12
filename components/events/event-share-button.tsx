"use client";

import { useTranslations, useLocale } from "next-intl";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShare } from "@/lib/hooks/use-share";

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
  const { share, copied } = useShare();

  const eventUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${eventSlug}`;

  const formattedDate = new Date(startsAt).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const descriptionSnippet = eventDescription
    ? eventDescription.length <= 100
      ? eventDescription
      : (eventDescription.slice(0, eventDescription.lastIndexOf(" ", 100)) || eventDescription.slice(0, 100)) + "..."
    : null;

  const shareText = `🎉 ${t("youreInvited")}\n\n${eventTitle}\n📅 ${formattedDate}${descriptionSnippet ? `\n\n${descriptionSnippet}` : ""}`;

  const handleShare = () =>
    share({
      title: eventTitle,
      text: shareText,
      url: eventUrl,
    });

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
