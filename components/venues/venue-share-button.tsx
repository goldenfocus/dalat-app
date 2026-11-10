"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShare } from "@/lib/hooks/use-share";

interface VenueShareButtonProps {
  name?: string;
  shareText?: string;
  url: string;
  label: string;
}

export function VenueShareButton({
  name,
  shareText,
  url,
  label,
}: VenueShareButtonProps) {
  const { share, copyText, copied } = useShare();
  const t = useTranslations("common");

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        // Venue callers supply only the URL: Zalo can concatenate optional
        // title/text fields without separators. Keep metadata opt-in for
        // existing organizer callers of this shared component.
        onClick={() => share({
          ...(name && { title: `${name} — ĐàLạt.app` }),
          ...(shareText && { text: shareText }),
          url,
        })}
        className="inline-flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted active:scale-95 transition-all"
      >
        <Share2 className="w-4 h-4" />
        {label}
      </button>
      <button
        type="button"
        onClick={() => copyText(url)}
        className="inline-flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span aria-live="polite">{copied ? t("copied") : t("copyLink")}</span>
      </button>
    </div>
  );
}
