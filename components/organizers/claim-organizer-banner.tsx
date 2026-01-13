"use client";

import { Link } from "@/lib/i18n/routing";
import { ShieldCheck, Building2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface ClaimOrganizerBannerProps {
  organizerSlug: string;
  organizerName: string;
  eventCount: number;
}

export function ClaimOrganizerBanner({
  organizerSlug,
  organizerName,
  eventCount,
}: ClaimOrganizerBannerProps) {
  const t = useTranslations("organizer");

  return (
    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 border-dashed mb-6">
      <div className="flex items-start gap-3">
        <Building2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-foreground">
            {t("claimBanner.title")}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("claimBanner.description", {
              name: organizerName,
              count: eventCount,
            })}
          </p>
          <Link
            href={`/settings/verification?organizer=${organizerSlug}`}
            className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all text-sm font-medium"
          >
            <ShieldCheck className="h-4 w-4" />
            {t("claimBanner.button")}
          </Link>
        </div>
      </div>
    </div>
  );
}

// Badge for unclaimed organizer status
interface UnclaimedOrganizerBadgeProps {
  className?: string;
}

export function UnclaimedOrganizerBadge({ className }: UnclaimedOrganizerBadgeProps) {
  const t = useTranslations("organizer");

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border ${className ?? ""}`}
    >
      <Building2 className="h-3 w-3" />
      {t("claimBanner.unclaimed")}
    </span>
  );
}
