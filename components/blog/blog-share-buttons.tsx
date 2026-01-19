"use client";

import { useState } from "react";
import { Share2, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/haptics";

interface BlogShareButtonsProps {
  title: string;
  url: string;
  shareText?: string | null;
}

export function BlogShareButtons({ title, url, shareText }: BlogShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const fullUrl = typeof window !== "undefined"
    ? `${window.location.origin}${url}`
    : url;

  const handleShare = async () => {
    triggerHaptic("selection");

    const shareData = {
      title,
      text: shareText || title,
      url: fullUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        triggerHaptic("medium");
      } catch (error) {
        // User cancelled or error - fall back to copy
        if ((error as Error).name !== "AbortError") {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      triggerHaptic("medium");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Share button (uses native share on mobile) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        className="gap-2 active:scale-95 transition-all"
      >
        <Share2 className="w-4 h-4" />
        <span className="hidden sm:inline">Share</span>
      </Button>

      {/* Copy link button */}
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
