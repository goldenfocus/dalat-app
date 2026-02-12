"use client";

import { useTranslations } from "next-intl";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShare } from "@/lib/hooks/use-share";

interface PlaylistShareButtonProps {
  title: string;
  url: string;
  trackCount: number;
}

export function PlaylistShareButton({ title, url, trackCount }: PlaylistShareButtonProps) {
  const t = useTranslations("playlist");
  const tc = useTranslations("common");
  const { share, copied } = useShare();

  const handleShare = () =>
    share({
      title,
      text: `${title}\n${t("tracks", { count: trackCount })}`,
      url,
    });

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleShare}
      className="gap-2"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4" />
          <span>{tc("copied")}</span>
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4" />
          <span>{tc("share")}</span>
        </>
      )}
    </Button>
  );
}
