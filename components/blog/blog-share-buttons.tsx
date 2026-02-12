"use client";

import { Share2, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShare } from "@/lib/hooks/use-share";

interface BlogShareButtonsProps {
  title: string;
  url: string;
  shareText?: string | null;
}

export function BlogShareButtons({ title, url, shareText }: BlogShareButtonsProps) {
  const { share, copyText, copied } = useShare();

  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${url}` : url;

  const handleShare = () =>
    share({
      title,
      text: shareText || title,
      url: fullUrl,
    });

  const handleCopy = () => copyText(fullUrl);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        className="gap-2 active:scale-95 transition-all"
      >
        <Share2 className="w-4 h-4" />
        <span className="hidden sm:inline">Share</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="gap-2 active:scale-95 transition-all"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-green-500" />
            <span className="text-green-500">Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            <span className="hidden sm:inline">Copy link</span>
          </>
        )}
      </Button>
    </div>
  );
}
