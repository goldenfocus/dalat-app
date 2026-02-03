"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlaylistShareButtonProps {
  title: string;
  url: string;
  trackCount: number;
}

export function PlaylistShareButton({ title, url, trackCount }: PlaylistShareButtonProps) {
  const t = useTranslations("playlist");
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const handleShare = async () => {
    const shareText = `${title}\n${t("tracks", { count: trackCount })}`;

    if (canShare) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url,
        });
      } catch {
        // User cancelled or share failed - fallback to copy
        await copyToClipboard();
      }
    } else {
      await copyToClipboard();
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
