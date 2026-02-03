"use client";

import { Link } from "@/lib/i18n/routing";
import { ArrowLeft, Grid3X3, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

interface MomentDetailHeaderProps {
  eventSlug: string;
  eventTitle: string;
  /** Where the user came from - affects back navigation */
  from?: string;
}

/**
 * Context-aware back navigation.
 * Returns user to the view they came from for better UX continuity.
 */
function getBackUrl(eventSlug: string, from?: string): string {
  const basePath = `/events/${eventSlug}/moments`;

  // Return to immersive mode if that's where user came from
  if (from === "immersive") {
    return `${basePath}?view=immersive`;
  }

  // Lightbox users were already on the grid, so go back to grid
  // Default: let the page use the user's preferred view mode
  return basePath;
}

export function MomentDetailHeader({
  eventSlug,
  eventTitle,
  from,
}: MomentDetailHeaderProps) {
  const t = useTranslations("moments");
  const backUrl = getBackUrl(eventSlug, from);
  const isFromImmersive = from === "immersive";

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Back button - mobile-first touch target per CLAUDE.md */}
          <Link
            href={backUrl}
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium truncate max-w-[200px]">
              {eventTitle}
            </span>
          </Link>

          {/* View mode indicator - shows where user will return to */}
          <div className="flex items-center gap-1 text-muted-foreground">
            {isFromImmersive ? (
              <Smartphone className="w-4 h-4" />
            ) : (
              <Grid3X3 className="w-4 h-4" />
            )}
            <span className="text-xs hidden sm:inline">{t("viewAll")}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
