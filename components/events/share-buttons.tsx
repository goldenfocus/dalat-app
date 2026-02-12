"use client";

import { useTranslations, useLocale } from "next-intl";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShare } from "@/lib/hooks/use-share";

interface ShareButtonsProps {
  eventUrl: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
  showWhatsApp?: boolean;
}

export function ShareButtons({
  eventUrl,
  eventTitle,
  eventDescription,
  startsAt,
  showWhatsApp = false,
}: ShareButtonsProps) {
  const t = useTranslations("invite");
  const locale = useLocale();
  const { share, copyText, copied, canShare } = useShare();

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

  const handleNativeShare = () =>
    share({
      title: eventTitle,
      text: shareText,
      url: eventUrl,
    });

  const handleCopyLink = () =>
    copyText(`${eventUrl}\n${shareText}`);

  const handleWhatsApp = () => {
    const whatsAppMessage = [
      `🎉 ${t("youreInvited")}`,
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
    window.open(`https://wa.me/?text=${encodeURIComponent(whatsAppMessage)}`, "_blank");
  };

  // Zalo uses native share sheet for best contact picker experience
  const handleZalo = () =>
    share({
      title: eventTitle,
      text: shareText,
      url: eventUrl,
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
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

      {showWhatsApp && (
        <div className="flex gap-2 md:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={handleWhatsApp}
            className="flex-1 gap-2 text-muted-foreground active:scale-95 transition-transform"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            WhatsApp
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleZalo}
            className="flex-1 gap-2 text-muted-foreground active:scale-95 transition-transform"
          >
            <svg viewBox="0 0 48 48" className="w-4 h-4 fill-current">
              <path d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4zm6.164 28.91H15.043v-3.516h6.09l-6.258-8.477v-3.445h11.797v3.516h-5.8l6.292 8.477v3.445zm3.946-7.137c-.27.27-.613.404-1.028.404h-1.16v3.473h-3.145V18.473h4.305c.415 0 .757.135 1.028.404.27.27.405.613.405 1.028v4.84c0 .415-.135.757-.405 1.028z" />
            </svg>
            {t("zalo")}
          </Button>
        </div>
      )}
    </div>
  );
}
