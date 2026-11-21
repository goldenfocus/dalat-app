"use client";

import { useTranslations } from "next-intl";
import { Check, Share2 } from "lucide-react";
import { useShare } from "@/lib/hooks/use-share";

export function SharePageButton({ url }: { url: string }) {
  const t = useTranslations("common");
  const { share, copied } = useShare();

  return (
    <button
      type="button"
      onClick={() => share({ url })}
      className="grid size-11 shrink-0 place-items-center rounded-lg text-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={copied ? t("copied") : t("share")}
    >
      {copied ? <Check className="size-5 text-green-600" aria-hidden="true" /> : <Share2 className="size-5" aria-hidden="true" />}
    </button>
  );
}
