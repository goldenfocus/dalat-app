"use client";

import { Link } from "@/lib/i18n/routing";
import { UserPlus, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface ClaimProfileBannerProps {
  ghostProfileId: string;
  ghostDisplayName: string;
  eventCount: number;
}

export function ClaimProfileBanner({
  ghostProfileId,
  ghostDisplayName,
  eventCount,
}: ClaimProfileBannerProps) {
  const t = useTranslations("profile");

  return (
    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-amber-700 dark:text-amber-300">
            {t("claimBanner.title")}
          </h3>
          <p className="text-sm text-amber-600/90 dark:text-amber-400/90 mt-1">
            {t("claimBanner.description", {
              name: ghostDisplayName,
              count: eventCount,
            })}
          </p>
          <Link
            href={`/settings/verification?claim=${ghostProfileId}`}
            className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-md bg-amber-500 text-white hover:bg-amber-600 active:scale-95 transition-all text-sm font-medium"
          >
            <UserPlus className="h-4 w-4" />
            {t("claimBanner.button")}
          </Link>
        </div>
      </div>
    </div>
  );
}

// Badge component for showing "Community Imported" status
interface GhostProfileBadgeProps {
  className?: string;
}

export function GhostProfileBadge({ className }: GhostProfileBadgeProps) {
  const t = useTranslations("profile");

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 ${className ?? ""}`}
    >
      <AlertCircle className="h-3 w-3" />
      {t("claimBanner.communityImported")}
    </span>
  );
}
