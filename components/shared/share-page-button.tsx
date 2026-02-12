"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Check, Link } from "lucide-react";
import { useShare } from "@/lib/hooks/use-share";

interface SharePageButtonProps {
  url?: string;
  title?: string;
  showLabel?: boolean;
  className?: string;
}

export function SharePageButton({
  url,
  title,
  showLabel = false,
  className = "",
}: SharePageButtonProps) {
  const t = useTranslations("common");
  const { share, copied } = useShare();
  const [shareUrl, setShareUrl] = useState(url || "");

  useEffect(() => {
    if (!url && typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, [url]);

  const handleShare = () =>
    share({
      title: title || (typeof document !== "undefined" ? document.title : ""),
      url: url || shareUrl,
    });

  return (
    <button
      onClick={handleShare}
      className={`-mr-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg ${className}`}
      aria-label={copied ? t("copied") : t("share")}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-green-500" />
          {showLabel && <span className="text-sm text-green-500">{t("copied")}</span>}
        </>
      ) : (
        <>
          <Link className="w-4 h-4" />
          {showLabel && <span className="text-sm">{t("share")}</span>}
        </>
      )}
    </button>
  );
}
